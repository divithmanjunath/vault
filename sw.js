// Service worker: caches the app so it opens with no internet.
// Online: fetches the latest files (so updates arrive) and refreshes the cache.
// Offline or slow network: serves the cached copy.
const CACHE = 'vault-v2';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './markdown.js', './zip.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const network = fetch(request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)); }
      return res;
    });
    network.catch(() => {});

    // Network first, but don't wait more than 3s before trying the cache
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    try {
      return await Promise.race([network, timeout]);
    } catch (_) {
      const cached = await caches.match(request, { ignoreSearch: true })
        || (request.mode === 'navigate' && await caches.match('./index.html'));
      if (cached) return cached;
      try { return await network; } catch (_) { return Response.error(); }
    }
  })());
});
