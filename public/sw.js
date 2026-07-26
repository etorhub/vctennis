/* Minimal service worker for PWA installability — no offline caching of app data. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-only: always go to the network.
  event.respondWith(fetch(event.request));
});
