"use strict";

const functions = require("firebase-functions/v1");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {createHmac} = require("node:crypto");

initializeApp();

const auth = getAuth();
const db = getFirestore();
const UPLOADCARE_SECRET_KEY = defineSecret("UPLOADCARE_SECRET_KEY");
const UPLOADCARE_PUBLIC_KEY = "61272880552672ca7a71";
const PRIMARY_ADMIN_EMAIL = "admin@onclicksolutions.in";
const USER_DELETION_JOBS = "userDeletionJobs";

class LinkedFileCleanupError extends Error {
  constructor(message, result) {
    super(message);
    this.name = "LinkedFileCleanupError";
    this.code = "linked-file-cleanup-pending";
    this.result = result;
  }
}

function uploadcareUuid(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(
        /(?:ucarecdn\.com|ucarecd\.net)\/([0-9a-f]{8}-[0-9a-f-]{27,})/i,
    );
    return match ? match[1] : "";
  }

  if (typeof value === "object") {
    return String(value.uuid || uploadcareUuid(value.url) || "").trim();
  }

  return "";
}

function collectUploadcareUuids(applicationDocs) {
  const uuids = new Set();

  applicationDocs.forEach((doc) => {
    const data = doc.data() || {};
    const files = []
        .concat(Array.isArray(data.fileURLs) ? data.fileURLs : [])
        .concat(Array.isArray(data.adminDocs) ? data.adminDocs : []);

    files.forEach((file) => {
      const uuid = uploadcareUuid(file);
      if (uuid) uuids.add(uuid);
    });
  });

  return Array.from(uuids);
}

async function deleteUploadcareFile(uuid) {
  const secret = UPLOADCARE_SECRET_KEY.value();
  if (!secret) {
    throw new Error("UPLOADCARE_SECRET_KEY is not configured.");
  }

  const uri = `/files/${encodeURIComponent(uuid)}/storage/`;
  const dateHeader = new Date().toUTCString();
  const signature = createHmac("sha1", secret)
      .update(["DELETE", "", "", dateHeader, uri].join("\n"))
      .digest("hex");

  const response = await fetch(
      `https://api.uploadcare.com${uri}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.uploadcare-v0.7+json",
          Date: dateHeader,
          Authorization: `Uploadcare ${UPLOADCARE_PUBLIC_KEY}:${signature}`,
        },
      },
  );

  // A missing file is already deleted, so retries remain safe.
  if (response.ok || response.status === 404) return;

  const responseText = await response.text();
  throw new Error(
      `Uploadcare could not delete ${uuid} (${response.status}): ` +
      responseText.slice(0, 300),
  );
}

async function deleteUploadcareFiles(uuids) {
  // Keep concurrency controlled so a user with many documents does not
  // overload the Uploadcare REST API.
  const concurrency = 5;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < uuids.length) {
      const index = nextIndex++;
      await deleteUploadcareFile(uuids[index]);
    }
  }

  await Promise.all(
      Array.from({length: Math.min(concurrency, uuids.length)}, worker),
  );
}

async function deleteFirestoreDocuments(refs) {
  if (!refs.length) return;

  const writer = db.bulkWriter();
  refs.forEach((ref) => writer.delete(ref));
  await writer.close();
}

async function cleanupUserData(uid) {
  if (!uid || typeof uid !== "string") {
    throw new Error("A valid user ID is required.");
  }

  const cleanupJobRef = db.collection(USER_DELETION_JOBS).doc(uid);
  const [applicationSnap, invoiceSnap, cleanupJobSnap] = await Promise.all([
    db.collection("applications").where("userId", "==", uid).get(),
    db.collection("invoices").where("userId", "==", uid).get(),
    cleanupJobRef.get(),
  ]);

  const applicationDocs = applicationSnap.docs;
  const savedUuids = cleanupJobSnap.exists &&
    Array.isArray(cleanupJobSnap.data().uploadcareUuids) ?
    cleanupJobSnap.data().uploadcareUuids : [];
  const uploadcareUuids = Array.from(new Set([
    ...collectUploadcareUuids(applicationDocs),
    ...savedUuids,
  ]));

  // Preserve external file IDs before removing application records. If
  // Uploadcare is temporarily unavailable, Auth/Firestore deletion can still
  // finish and retrying triggers can recover the IDs from this job document.
  if (uploadcareUuids.length) {
    await cleanupJobRef.set({
      uid,
      uploadcareUuids,
      status: "pending",
      updatedAt: new Date().toISOString(),
    }, {merge: true});
  }

  let chatCount = 0;
  for (const applicationDoc of applicationDocs) {
    const chatRef = db.collection("chats").doc(applicationDoc.id);
    await db.recursiveDelete(chatRef);
    chatCount++;
  }

  await deleteFirestoreDocuments([
    ...applicationDocs.map((doc) => doc.ref),
    ...invoiceSnap.docs.map((doc) => doc.ref),
  ]);

  // Delete the profile after all linked Firestore records are gone.
  await db.collection("users").doc(uid).delete();

  const result = {
    applications: applicationDocs.length,
    invoices: invoiceSnap.size,
    chats: chatCount,
    uploadedFiles: uploadcareUuids.length,
    fileCleanupPending: false,
  };

  try {
    await deleteUploadcareFiles(uploadcareUuids);
    if (cleanupJobSnap.exists || uploadcareUuids.length) {
      await cleanupJobRef.delete();
    }
    return result;
  } catch (error) {
    await cleanupJobRef.set({
      uid,
      uploadcareUuids,
      status: "pending",
      lastError: String(error && error.message || error).slice(0, 500),
      updatedAt: new Date().toISOString(),
    }, {merge: true});
    throw new LinkedFileCleanupError(
        "Linked files are pending automatic cleanup.",
        {...result, fileCleanupPending: true},
    );
  }
}

exports.cleanupDeletedAuthUser = functions
    .region("us-central1")
    .runWith({
      timeoutSeconds: 540,
      memory: "512MB",
      secrets: [UPLOADCARE_SECRET_KEY],
      failurePolicy: true,
    })
    .auth.user()
    .onDelete(async (user) => {
      const result = await cleanupUserData(user.uid);
      functions.logger.info("Deleted data for removed Auth user.", {
        uid: user.uid,
        ...result,
      });
    });

exports.cleanupDeletedUserProfile = functions
    .region("us-central1")
    .runWith({
      timeoutSeconds: 540,
      memory: "512MB",
      secrets: [UPLOADCARE_SECRET_KEY],
      failurePolicy: true,
    })
    .firestore.document("users/{uid}")
    .onDelete(async (snapshot, context) => {
      const uid = context.params.uid;

      // Remove linked data before Auth. This avoids leaving an Auth-deleted
      // user visible in the admin panel when linked cleanup needs a retry.
      const result = await cleanupUserData(uid);

      try {
        await auth.deleteUser(uid);
      } catch (error) {
        if (!error || error.code !== "auth/user-not-found") throw error;
      }

      functions.logger.info("Deleted data for removed Firestore profile.", {
        uid,
        ...result,
      });
    });

exports.deleteUserCompletely = functions
    .region("us-central1")
    .runWith({
      timeoutSeconds: 540,
      memory: "512MB",
      secrets: [UPLOADCARE_SECRET_KEY],
    })
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Please sign in again.",
        );
      }

      const callerEmail = String(context.auth.token.email || "").toLowerCase();
      if (callerEmail !== PRIMARY_ADMIN_EMAIL) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Only the primary admin can permanently delete users.",
        );
      }

      const uid = String((data && data.uid) || "").trim();
      if (!uid) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "User ID is required.",
        );
      }
      if (uid === context.auth.uid) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "You cannot delete your own admin account.",
        );
      }

      let result;
      try {
        result = await cleanupUserData(uid);
      } catch (error) {
        if (error && error.code === "linked-file-cleanup-pending") {
          result = error.result;
          functions.logger.warn("User records deleted; file cleanup pending.", {
            adminUid: context.auth.uid,
            uid,
            error,
          });
        } else {
          functions.logger.error("User data cleanup failed.", {uid, error});
          throw new functions.https.HttpsError(
              "internal",
              "Linked user data could not be removed. The login was kept so " +
              "you can safely retry.",
          );
        }
      }

      try {
        // Delete Auth last. If linked database cleanup fails, the account is
        // intentionally kept instead of creating an orphaned admin entry.
        await auth.deleteUser(uid);
      } catch (error) {
        if (!error || error.code !== "auth/user-not-found") {
          functions.logger.error("Authentication deletion failed.", {
            uid,
            error,
          });
          throw new functions.https.HttpsError(
              "internal",
              "Linked data was removed, but the Authentication account could " +
              "not be deleted. Please retry.",
          );
        }
      }

      functions.logger.info("Admin permanently deleted a user.", {
        adminUid: context.auth.uid,
        uid,
        ...result,
      });
      return {ok: true, ...result};
    });
