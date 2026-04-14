const CACHE_NAME = "mk360-cache-v7";

self.addEventListener("install", (event) => {
  const scope = self.registration.scope;
  // Pré-cache mínimo; index.html deve priorizar rede para evitar executar JS antigo.
  const paths = [
    "manifest.webmanifest",
    "icon.svg",
    "vendor/tailwind-built.css",
  ];
  const urls = paths.map((p) => new URL(p, scope).href);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(urls.map((u) => cache.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const isHttp = requestUrl.protocol.startsWith("http");
  if (!isHttp) return;

  const indexUrl = new URL("index.html", self.registration.scope).href;
  const isDocumentRequest =
    event.request.mode === "navigate" ||
    event.request.destination === "document";

  if (isDocumentRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== "opaque") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(indexUrl)))
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
        .catch(() => caches.match(indexUrl));
    })
  );
});
