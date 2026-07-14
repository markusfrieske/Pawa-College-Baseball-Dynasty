const CACHE_NAME = 'cbd-shell-v2';
const STATIC_CACHE = 'cbd-static-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try { await cache.add('/'); } catch (_) {}
      try { await cache.add('/manifest.json'); } catch (_) {}
      try { await cache.add('/favicon.png'); } catch (_) {}
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) return;

  const isStaticAsset =
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|mp3|webp)$/) ||
    url.pathname.startsWith('/music/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/storyline-images/');

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) {
            fetch(request).then((fresh) => {
              if (fresh.ok) cache.put(request, fresh);
            }).catch(() => {});
            return cached;
          }
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((cached) => cached || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }
});
