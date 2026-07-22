// firebase-messaging-sw.js
// This file MUST be at the root of your site: https://onclicksolutions.in/firebase-messaging-sw.js
// It handles push notifications when the site tab is closed / in the background.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDto3zYQzxXdZrGcr5DyzqjlQcB5FlDHuk",
  authDomain: "onclicksolutions.firebaseapp.com",
  projectId: "onclicksolutions",
  storageBucket: "onclicksolutions.firebasestorage.app",
  messagingSenderId: "596321952643",
  appId: "1:596321952643:web:630d19e69f569519b3ccb6"
});

const messaging = firebase.messaging();

// Show a system notification when a push arrives while the tab is closed/backgrounded
messaging.onBackgroundMessage(function(payload) {
  var title = (payload.notification && payload.notification.title) || 'On Click Solutions';
  var options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: 'https://2rz0648lib.ucarecd.net/1847cbfe-8a8c-4651-b257-13f098e8edf8/ONCLogo.png',
    badge: 'https://2rz0648lib.ucarecd.net/1847cbfe-8a8c-4651-b257-13f098e8edf8/ONCLogo.png',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

// Open/focus the dashboard when a notification is clicked
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('onclicksolutions.in') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('https://onclicksolutions.in/#dashboard');
      }
    })
  );
});
