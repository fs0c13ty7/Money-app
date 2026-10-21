/* Money Tracker service worker: makes the app open instantly and work fully offline.
   It only caches the app's own files and fonts. Your money data lives in IndexedDB, never here. */
const VERSION = 'mt-v1.3.1';
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/util.js',
  'js/db.js',
  'js/store.js',
  'js/smart.js',
  'js/charts.js',
  'js/ui.js',
  'js/views.js',
  'js/sheets.js',
  'js/importer.js',
  'js/main.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'mt-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* fonts: cache once, then serve offline */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open('mt-fonts').then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit))
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  /* app files: serve from cache straight away, refresh the cache in the background */
  event.respondWith(
    caches.open(VERSION).then((c) =>
      c.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit || c.match('index.html'));
        return hit || net;
      })
    )
  );
});
