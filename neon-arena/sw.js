/* Neon Arena service worker — cache-first so it plays offline after first load.
   Vendored three.min.js is same-origin, so it caches with everything else. */
const CACHE = 'neon-arena-v1';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      try { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } catch (_) {}
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
