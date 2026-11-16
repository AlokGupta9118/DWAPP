const CACHE_NAME = 'focusflow-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/focusflow.svg', '/icons/focusflow-192.png', '/icons/focusflow-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      const index = await cache.match('/index.html');
      if (index) {
        const html = await index.text();
        const assets = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1])
          .filter(path => path.startsWith('/') && !APP_SHELL.includes(path));
        if (assets.length) await cache.addAll(assets);
      }
    })()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('focusflow-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const copy = response.clone();
          await (await caches.open(CACHE_NAME)).put('/index.html', copy);
          return response;
        } catch {
          return (await caches.match(request)) || (await caches.match('/index.html'));
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        await (await caches.open(CACHE_NAME)).put(request, copy);
      }
      return response;
    })()
  );
});
