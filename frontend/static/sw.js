/* Ceòl – Service Worker
   Caches the app shell for fast startup and basic offline support.
   API calls (/api/*) always go network-first so data stays fresh.
   ---------------------------------------------------------------- */

const CACHE  = "ceol-v1";
const SHELL  = [
  "/mobile",
  "/static/style.css",
  "/static/mobile.css",
  "/static/app.js",
  "/static/mobile.js",
  "/static/abcjs-basic-min.js",
  "/static/abcjs-audio.css",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

// ── Install: pre-cache the app shell ──────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for shell ──────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Always hit the network for API calls (data must be live)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For everything else: try cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
