const CACHE_NAME = "mk360-cache-v8"; // Incrementado para forçar atualização

self.addEventListener("install", (event) => {
  const scope = self.registration.scope;
  const assetsToCache = [
    new URL("index.html", scope).href,
    new URL("manifest.webmanifest", scope).href,
    new URL("icon.svg", scope).href,
  ];

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache
          .addAll(assetsToCache)
          .catch((err) => console.warn("Cache inicial falhou, ignorando...", err))
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Estratégia: Network First para index.html (evitar cache de erros), Cache First para o resto
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const indexUrl = new URL("index.html", self.registration.scope).href;

  // Não cachear chamadas de API nem métodos não-GET
  if (url.pathname.includes("/api/") || event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(indexUrl))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
