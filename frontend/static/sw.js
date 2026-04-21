// Ceòl — no-cache service worker
// Enables PWA standalone mode. Never caches anything — always live from server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  // Delete ALL caches on activation
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
// No fetch handler — every request goes straight to the network
