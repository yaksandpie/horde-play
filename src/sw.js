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

/* Only a good response is worth keeping. A 404 or 503 from Pages mid-deploy,
   or a captive portal's 200 with someone else's page in it, would otherwise
   replace the shell an installed copy has to fall back on. */
const keep = (request, response) => {
  if (!response.ok || response.type !== "basic") return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
};

const cachedPage = (request) =>
  caches.match(request).then((cached) => cached || caches.match("./index.html"));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Page loads: try the network first so you always get the latest version
  // when you have signal, and fall back to the cached copy when you don't —
  // or when what came back is an error page rather than the app.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) { keep(request, response); return response; }
          return cachedPage(request).then((cached) => cached || response);
        })
        .catch(() => cachedPage(request))
    );
    return;
  }

  // Same-origin assets (manifest, icons, fonts): serve from cache instantly,
  // and refresh the cache in the background when online.
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => { keep(request, response); return response; })
          .catch(() => cached || Response.error());
        return cached || networkFetch;
      })
    );
  }
});
