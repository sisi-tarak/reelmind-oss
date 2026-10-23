// ReelMind service worker: makes the app installable (so it can appear in Instagram's Share menu on Android)
// and lets it open without a connection. Your notes already live on the device; this only caches the app itself.
const CACHE = 'reelmind-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only this site's own files. Never the helper, Firebase or anything else.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Pages: fresh when online, the saved app shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Built files have unique names, so a cached copy is always right.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
