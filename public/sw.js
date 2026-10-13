const CACHE_PREFIX = 'recipes-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(self.registration.scope))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (!response.ok || response.type !== 'basic' || response.redirected) return;
  let copy;
  try {
    copy = response.clone();
  } catch {
    return;
  }
  void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;

  if (url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(request.url, { cache: 'no-store', credentials: 'same-origin' }));
    return;
  }

  if (url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(
      fetch(request.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => {
          remember(request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? new Response('', { status: 504 })),
    );
    return;
  }

  if (/\/plates\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    const cachePromise = caches.open(CACHE_NAME);
    const networkPromise = fetch(request).then(async (response) => {
      if (response.ok && response.type === 'basic' && !response.redirected) {
        const cache = await cachePromise.catch(() => undefined);
        if (cache) await cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    }).catch(() => undefined);
    event.waitUntil(networkPromise.then(() => undefined));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const cached = await cache.match(request);
      if (cached) return cached;
      return (await networkPromise) ?? new Response('', { status: 504 });
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          remember(request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? caches.match(self.registration.scope)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        remember(request, response);
        return response;
      });
    }),
  );
});
