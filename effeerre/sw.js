const BASE = "/LTS-Registro-Viaggi/effeerre/";
const PREFIX = "effeerre-iphone-pages-0ba8c62dd013-";
const CACHE = PREFIX + 'e4732c9e1a6c6f3d';
const CORE = [
  "/LTS-Registro-Viaggi/effeerre/app.css",
  "/LTS-Registro-Viaggi/effeerre/app.mjs",
  "/LTS-Registro-Viaggi/effeerre/assets/apple-touch-icon.png",
  "/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo-pdf.png",
  "/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo.png",
  "/LTS-Registro-Viaggi/effeerre/assets/icon-192.png",
  "/LTS-Registro-Viaggi/effeerre/assets/icon-512.png",
  "/LTS-Registro-Viaggi/effeerre/assets/vendor/fflate.mjs",
  "/LTS-Registro-Viaggi/effeerre/assets/vendor/jspdf.plugin.autotable.min.js",
  "/LTS-Registro-Viaggi/effeerre/assets/vendor/jspdf.umd.min.js",
  "/LTS-Registro-Viaggi/effeerre/client-store.mjs",
  "/LTS-Registro-Viaggi/effeerre/index.html",
  "/LTS-Registro-Viaggi/effeerre/manifest.webmanifest",
  "/LTS-Registro-Viaggi/effeerre/runtime-config.mjs",
  "/LTS-Registro-Viaggi/effeerre/shared/android-backup.mjs",
  "/LTS-Registro-Viaggi/effeerre/shared/domain.mjs",
  "/LTS-Registro-Viaggi/effeerre/shared/pdf.mjs",
  "/LTS-Registro-Viaggi/effeerre/shared/vendor/fflate.mjs",
  "/LTS-Registro-Viaggi/effeerre/shell.html"
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
