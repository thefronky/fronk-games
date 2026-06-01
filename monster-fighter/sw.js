/* Monster Fighter service worker — runtime cache-first so it works offline
   after the first load (no need to enumerate the ~100 asset files). */
const CACHE = 'monster-fighter-v2';

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
      // cache same-origin + CDN (three.js) responses for offline replays
      try {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      } catch (_) {}
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
