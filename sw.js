// Nihonify (漢字学習) Service Worker — v7.0 (100% Built-in Offline Engine)
const CACHE_NAME = "nihonify-v7.0";
const RUNTIME_CACHE = "nihonify-runtime-v7.0";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./strokes-data.js",
  "./icon-192.png",
  "./icon-512.png"
];

const EXTERNAL_PRECACHE = [
  "https://cdn.tailwindcss.com/3.4.17"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {})),
      caches.open(RUNTIME_CACHE).then((cache) =>
        Promise.all(EXTERNAL_PRECACHE.map((u) => fetch(u, { mode: "cors" }).then((r) => {
          if (r && (r.ok || r.type === "opaque")) return cache.put(u, r);
        }).catch(() => {})))
      )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isLiveFirebaseApi(url) {
  const h = url.hostname;
  return (
    h.includes("firestore.googleapis.com") ||
    h.includes("identitytoolkit.googleapis.com") ||
    h.includes("securetoken.googleapis.com") ||
    h.includes("firebaseio.com") ||
    h.includes("firebaseinstallations.googleapis.com") ||
    h.includes("apis.google.com")
  );
}

function isCacheableExternal(url) {
  const h = url.hostname;
  return (
    h === "cdn.tailwindcss.com" ||
    h === "fonts.googleapis.com" ||
    h === "fonts.gstatic.com" ||
    (h === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) ||
    h === "kanjiapi.dev" ||
    h === "cdn.jsdelivr.net"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept live Firebase Auth / Firestore database calls
  if (isLiveFirebaseApi(url)) return;

  // Network-First with fast 2.5s timeout fallback to cache for HTML navigation (zero lag offline!)
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || (url.origin === self.location.origin && url.pathname.endsWith("/"))) {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const fallback = () => {
          if (settled) return;
          settled = true;
          caches.match(req).then((c) => c || caches.match("./index.html")).then(resolve);
        };
        const timer = setTimeout(fallback, 2500);
        fetch(req)
          .then((res) => {
            clearTimeout(timer);
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
            }
            if (!settled) {
              settled = true;
              resolve(res);
            }
          })
          .catch(() => {
            clearTimeout(timer);
            fallback();
          });
      })
    );
    return;
  }

  // Cache-First with background refresh for local static assets (strokes-data.js, icons, manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const netFetch = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || netFetch;
      })
    );
    return;
  }

  // Cache-First for Tailwind CSS, Google Fonts, Firebase JS SDK, KanjiAPI & KanjiVG (100% Airplane-Mode Ready)
  if (isCacheableExternal(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const netFetch = fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === "opaque")) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || netFetch;
      })
    );
  }
});