/* Ceòl – Service Worker (pass-through)
   Exists only to enable PWA home-screen pinning.
   Does NOT cache anything that changes between deploys — HTML, JS, CSS
   are always fetched from the network so code updates land immediately.
   Only truly static assets (abcjs bundle, icons) are cached.
   ---------------------------------------------------------------- */

const CACHE = "ceol-v4";

const STATIC_ONLY = [
  "/static/abcjs-basic-min.js",
  "/static/abcjs-audio.css",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

// Install: pre-cache only the static-forever assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ONLY))
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// Activate: nuke every old cache so stale HTML/JS/CSS can never be served
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   /api/*              → always network
//   HTML pages          → always network (never cache)
//   versioned ?v= files → always network (cache-busted by URL)
//   truly static files  → cache-first (abcjs bundle, icons)
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML pages and versioned assets: network only (fast, no stale risk)
  const isHtml       = !url.pathname.startsWith("/static/");
  const isVersioned  = url.search.includes("v=");
  if (isHtml || isVersioned) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Truly static assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(event.request, res.clone()));
      return res;
    }))
  );
});
