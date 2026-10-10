/* CampBit Service Worker - Offline Application Shell & Attendance Queue Support */
const CACHE_NAME = 'campbit-shell-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css?v=20261009j',
  '/api.js?v=20261009j',
  '/script.js?v=20261009j',
  '/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('SW pre-caching partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // For API endpoints, prefer network; if offline and it's a sync or read, allow client IndexedDB queue to handle
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(err => {
        // If network failed (airplane mode), respond with json indicating offline
        return new Response(JSON.stringify({
          error: 'Offline / Airplane mode active',
          offline: true,
          detail: 'Your action will be preserved in IndexedDB queue.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // For static shell files, try cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Fallback to cached index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});
