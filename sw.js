const CACHE_NAME = 'kanji-studio-v4.0';
const RUNTIME_CACHE = 'kanji-studio-runtime-v4.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './strokes-data.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  // Never cache Firebase Auth / Firestore live traffic
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  // Cache-First for offline strokes-data.js, KanjiVG SVGs, Google Fonts, and Tailwind CDN (0s instant load!)
  if (
    url.includes('strokes-data.js') ||
    url.includes('cdn.jsdelivr.net/gh/KanjiVG') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('cdn.tailwindcss.com')
  ) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return caches.match(req).then((coreCached) => {
            if (coreCached) return coreCached;
            return fetch(req)
              .then((res) => {
                if (res && (res.status === 200 || res.type === 'opaque')) {
                  cache.put(req, res.clone()).catch(() => {});
                }
                return res;
              })
              .catch(() => cached || coreCached);
          });
        })
      )
    );
    return;
  }

  // Network-First for app shell (index.html, manifest.json, icons) so updates show immediately
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});