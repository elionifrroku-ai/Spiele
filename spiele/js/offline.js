const CACHE = "spiele-v1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/db.js",
  "./js/extract.js",
  "./js/offline.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png",
];

const TAP_MAGIC = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.wasm",
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task",
];

export function registerOffline(onStatus) {
  if (!("serviceWorker" in navigator)) {
    onStatus({
      level: "none",
      text: "This browser cannot save the game for offline play.",
    });
    return;
  }

  navigator.serviceWorker
    .register("./sw.js")
    .then(() => refreshStatus(onStatus))
    .catch(() =>
      onStatus({
        level: "none",
        text: "Could not install offline play on this device.",
      })
    );

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "cache-updated") {
      refreshStatus(onStatus);
    }
  });

  navigator.serviceWorker.ready.then(() => refreshStatus(onStatus));
}

export async function refreshStatus(onStatus) {
  const shell = await allCached(SHELL);
  const magic = await allCached(TAP_MAGIC);
  if (magic && shell) {
    onStatus({
      level: "ready",
      text: "Ready to play without internet",
    });
    return;
  }
  if (shell) {
    onStatus({
      level: "partial",
      text: "Classroom is ready offline. Tap-to-lift saves after first use.",
    });
    return;
  }
  onStatus({
    level: "saving",
    text: "Saving for offline play…",
  });
}

async function allCached(urls) {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE);
    const hits = await Promise.all(
      urls.map((url) => cache.match(new URL(url, location.href).href))
    );
    return hits.every(Boolean);
  } catch {
    return false;
  }
}
