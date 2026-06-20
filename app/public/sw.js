// TanNote Service Worker — SELF-DESTRUCT.
// The previous cache-first SW caused stale app shells (cached index.html
// pointing to old, now-404 asset hashes) → white screen after deploys.
// This version unregisters itself and clears all caches so every device
// returns to plain network loading. Cache correctness is now handled by
// HTTP Cache-Control headers (see app/Dockerfile), not a service worker.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});

// Pass through everything — no caching.
self.addEventListener('fetch', () => {});
