// Service worker: makes the app open offline. It precaches the shell (HTML/CSS/JS + the vendored
// Supabase library) and serves same-origin requests cache-first. It deliberately does NOT touch
// Supabase API calls (a different origin) — those go straight to the network, and when there is no
// network the app falls back to the plan it cached in IndexedDB. Writes (POST/PATCH) are never cached.
const CACHE = "ironman-athlete-v11";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./config.js",
  "./vendor/supabase.js", "./manifest.webmanifest",
  "./icons/logo.png", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon-180.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  // No skipWaiting here: the new worker WAITS until the app tells it to take over (the athlete taps
  // "update"), so a running app is never swapped out mid-use. See the "message" handler below.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// The app posts this when the athlete taps "update": activate now, then activate's clients.claim()
// fires a controllerchange and the app reloads into the new code.
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // writes are never served from cache
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // Supabase (other origin) → straight to network
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))        // offline navigation → the app shell
    )
  );
});
