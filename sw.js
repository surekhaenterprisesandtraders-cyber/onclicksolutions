const CACHE_NAME = 'onclicksolutions-v3';
const urlsToCache = [
  '/onclicksolutions/',
  '/onclicksolutions/index.html'
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
  // Never cache Firebase, Firestore, API calls
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('googleapis.com') ||
      url.includes('emailjs') ||
      url.includes('uploadcare') ||
      url.includes('qrserver') ||
      url.includes('api.')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).catch(function() {
        return caches.match('/onclicksolutions/index.html');
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
