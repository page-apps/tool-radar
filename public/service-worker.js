const CACHE_PREFIX = "tool-radar-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL_ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootUrl = scopedUrl("./");
  const response = await fetch(rootUrl, { cache: "reload" });
  if (!response.ok) throw new Error(`Could not cache the app shell: ${response.status}`);
  const html = await response.clone().text();
  await cache.put(rootUrl, response);
  const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(([, path]) => new URL(path, rootUrl))
    .filter((url) => url.origin === self.location.origin && url.href.startsWith(self.registration.scope))
    .map((url) => { url.hash = ""; return url.href; });
  const assets = new Set([...SHELL_ASSETS.slice(1).map(scopedUrl), ...discovered]);
  await cache.addAll([...assets]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheShell()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Only same-origin static shell assets are cached. GitHub API requests,
// PAT headers and private radar data are deliberately excluded.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(scopedUrl("./"), response.clone()));
          return response;
        })
        .catch(() => caches.match(scopedUrl("./"))),
    );
    return;
  }

  if (!url.href.startsWith(self.registration.scope)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached ?? network;
    }),
  );
});
