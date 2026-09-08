/* The build fills both of these in: CACHE_VERSION from a hash of the shell's
   own bytes, APP_SHELL from what actually landed in _site. Shipping a changed
   shell under a stale version is what leaves an installed copy serving old
   files, and deriving the version from the files makes that impossible to
   forget — there is no number here for anyone to bump. */
const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `horde-play-${CACHE_VERSION}`;
const APP_SHELL = __APP_SHELL__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Page loads: try the network first so you always get the latest version
  // when you have signal, and fall back to the cached copy when you don't.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Same-origin assets (manifest, icons): serve from cache instantly,
  // and refresh the cache in the background when online.
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
