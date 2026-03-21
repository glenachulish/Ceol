/* Ceòl – Service Worker
   Only caches large infrequently-changed assets (abcjs, icons, manifest).
   HTML, CSS, and JS are always fetched from the network so code updates
   are picked up immediately without any cache-busting dance.
   API calls are always network-only.
   ---------------------------------------------------------------- */

const CACHE = "ceol-v3";

// Only pre-cache the truly static, rarely-changing assets.
// HTML/CSS/JS are intentionally excluded — always fetch fresh.
const PRECACHE = [
  "/static/abcjs-basic-min.js",
  "/static/abcjs-audio.css",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

// ── Install ────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
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

// ── Fetch ──────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // API: always network
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML pages + versioned CSS/JS: always network-first.
  // The ?v= query strings on CSS/JS ensure the browser HTTP cache is busted,
  // and the SW never serves a stale copy of these files.
  const isStaticAsset = url.pathname.startsWith("/static/");
  const isVersioned   = url.search.includes("v=");
  if (!isStaticAsset || isVersioned) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Unversioned static assets (abcjs, icons, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
