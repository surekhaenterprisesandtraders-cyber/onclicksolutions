const CACHE_NAME = 'onclicksolutions-v6';
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never cache these — always fetch fresh (live data, third-party services)
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('googleapis.com') ||
      url.includes('emailjs') ||
      url.includes('uploadcare') ||
      url.includes('ucarecdn') ||
      url.includes('qrserver') ||
      url.includes('api.')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network first for the main page — always get latest, fall back to cache/offline page
  if (url.endsWith('/') || url.endsWith('/index.html') || url.includes('/#')) {
    event.respondWith(
      fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // Offline — serve the last cached version of the app.
        // Since it's a single-page app with client-side routing, the cached
        // index.html still works fully for already-loaded data (Firestore
        // offline persistence handles the rest once the page loads).
        return caches.match('/index.html').then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // Cache first for other static assets (fonts, icons, etc.), network fallback
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // Last resort for navigation-like requests while fully offline
        return caches.match('/index.html');
      });
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.filter(function(name) {
            return name !== CACHE_NAME;
          }).map(function(name) {
            return caches.delete(name);
          })
        );
      })
    ])
  );
});
