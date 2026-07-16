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
  // Never cache these — always fresh
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
  // Network first for HTML pages — always get latest
  if (new URL(url).origin === self.location.origin &&
      (new URL(url).pathname === '/' || url.endsWith('index.html'))) {
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
        return caches.match(event.request).then(function(response) {
          return response || caches.match('/index.html');
        });
      })
    );
    return;
  }
  // Cache first for other static assets
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

