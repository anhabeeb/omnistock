const CACHE_NAME = "omnistock-shell-v4";
const APP_SHELL = ["/", "/manifest.webmanifest"];
const STATIC_DESTINATIONS = new Set(["script", "style", "font", "image"]);

async function openShellCache() {
  return caches.open(CACHE_NAME);
}

async function cacheShell() {
  const cache = await openShellCache();
  await cache.addAll(APP_SHELL);
}

async function navigationStrategy(request, preloadResponsePromise) {
  const cache = await openShellCache();

  try {
    const preloadResponse = await preloadResponsePromise;
    if (preloadResponse) {
      await cache.put("/", preloadResponse.clone());
      return preloadResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put("/", networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return (await cache.match(request)) || (await cache.match("/"));
  }
}

async function cacheFirstStrategy(request) {
  const cache = await openShellCache();
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function staleWhileRevalidateStrategy(request) {
  const cache = await openShellCache();
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(async (networkResponse) => {
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  });

  return cached || networkPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationStrategy(request, event.preloadResponse));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      cacheFirstStrategy(request).catch(async () => {
        return (await caches.match(request)) || caches.match("/");
      }),
    );
    return;
  }

  event.respondWith(
    staleWhileRevalidateStrategy(request).catch(async () => {
      return (await caches.match(request)) || caches.match("/");
    }),
  );
});
