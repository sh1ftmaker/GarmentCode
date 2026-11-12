// Offline cache: versioned CDN files cache-first; the app's own files network-first
// (cache only as an offline fallback). Stale-while-revalidate served a mix of old and
// new modules after each deploy (e.g. a new FreeSewing module with an old garment.js).
const CACHE = 'gc3d-v2';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const versionedCDN = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  const own = url.origin === self.location.origin;
  if (!versionedCDN && !own) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req);
    if (hit && versionedCDN) return hit;
    try {
      // own files: always revalidate with the server (GitHub Pages sends max-age=600)
      const res = await fetch(versionedCDN || req.mode === 'navigate' ? req : new Request(req.url, { cache: 'no-cache' }));
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      throw err;
    }
  }));
});
