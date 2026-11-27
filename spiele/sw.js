const CACHE = "spiele-v2";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/db.js",
  "./js/extract.js",
  "./js/offline.js",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/samples/two-children.png",
  "./assets/samples/puppy.png",
  "./assets/samples/teddy.png",
];

const TAP_MAGIC = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.wasm",
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task",
];

const CACHEABLE_HOSTS = new Set([
  self.location.host,
  "cdn.jsdelivr.net",
  "storage.googleapis.com",
]);

function notifyClients() {
  return self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const client of clients) client.postMessage({ type: "cache-updated" });
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      await notifyClients();
      const cache = await caches.open(CACHE);
      cache
        .addAll(TAP_MAGIC)
        .then(() => notifyClients())
        .catch(() => {});
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!CACHEABLE_HOSTS.has(url.host)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          const clients = await self.clients.matchAll({ type: "window" });
          for (const client of clients) {
            client.postMessage({ type: "cache-updated" });
          }
        }
        return res;
      } catch (err) {
        if (req.mode === "navigate") {
          const fallback = await cache.match("./index.html");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
