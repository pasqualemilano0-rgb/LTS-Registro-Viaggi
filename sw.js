const BASE = "/LTS-Registro-Viaggi/";
const PREFIX = "lts-iphone-pages-0aa8d087d02b-";
const CACHE = PREFIX + 'cf28a77a8aee8fec';
const CORE = [
  "/LTS-Registro-Viaggi/app.css",
  "/LTS-Registro-Viaggi/app.mjs",
  "/LTS-Registro-Viaggi/assets/apple-touch-icon.png",
  "/LTS-Registro-Viaggi/assets/icon-192.png",
  "/LTS-Registro-Viaggi/assets/icon-512.png",
  "/LTS-Registro-Viaggi/assets/lts-logo-pdf.png",
  "/LTS-Registro-Viaggi/assets/lts-logo.png",
  "/LTS-Registro-Viaggi/assets/vendor/fflate.mjs",
  "/LTS-Registro-Viaggi/assets/vendor/jspdf.plugin.autotable.min.js",
  "/LTS-Registro-Viaggi/assets/vendor/jspdf.umd.min.js",
  "/LTS-Registro-Viaggi/client-store.mjs",
  "/LTS-Registro-Viaggi/index.html",
  "/LTS-Registro-Viaggi/manifest.webmanifest",
  "/LTS-Registro-Viaggi/push-client.mjs",
  "/LTS-Registro-Viaggi/push-worker.js",
  "/LTS-Registro-Viaggi/runtime-config.mjs",
  "/LTS-Registro-Viaggi/shared/android-backup-export.mjs",
  "/LTS-Registro-Viaggi/shared/android-backup.mjs",
  "/LTS-Registro-Viaggi/shared/customer-csv.mjs",
  "/LTS-Registro-Viaggi/shared/domain.mjs",
  "/LTS-Registro-Viaggi/shared/maps-client.mjs",
  "/LTS-Registro-Viaggi/shared/pdf.mjs",
  "/LTS-Registro-Viaggi/shared/sync-merge.mjs",
  "/LTS-Registro-Viaggi/shared/vendor/fflate.mjs",
  "/LTS-Registro-Viaggi/shell.html"
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of CORE) {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.redirected) throw new Error('Preparazione della modalità offline non completata.');
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // The API is on a separate origin. Never cache personal records or API calls.
  if (url.origin !== self.location.origin || request.method !== 'GET' || !url.pathname.startsWith(BASE)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(BASE + 'index.html', { ignoreVary: true })) || Response.error()));
    return;
  }
  if (CORE.includes(url.pathname)) {
    event.respondWith((async () => (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) || fetch(request))());
  }
});

// Loaded by the worker, independently of an open page.
if (typeof importScripts === 'function') importScripts(new URL('push-worker.js', self.registration.scope).href);
