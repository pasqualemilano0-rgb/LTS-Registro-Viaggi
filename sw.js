const BASE = "/LTS-Registro-Viaggi/";
const PREFIX = "lts-iphone-pages-0aa8d087d02b-";
const CACHE = PREFIX + '20261103-admin-backup-v21';
const CORE = [
  "/LTS-Registro-Viaggi/account-access.mjs",
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
  "/LTS-Registro-Viaggi/driver-session-vault.mjs",
  "/LTS-Registro-Viaggi/index.html",
  "/LTS-Registro-Viaggi/manifest.webmanifest",
  "/LTS-Registro-Viaggi/porti/app.js",
  "/LTS-Registro-Viaggi/porti/assets/lts-logo.png",
  "/LTS-Registro-Viaggi/porti/assets/terminal-logos/conateco.png",
  "/LTS-Registro-Viaggi/porti/assets/terminal-logos/sct-compact.png",
  "/LTS-Registro-Viaggi/porti/assets/terminal-logos/tfg-portal.png",
  "/LTS-Registro-Viaggi/porti/booking_search.mjs",
  "/LTS-Registro-Viaggi/porti/conateco_booking.mjs",
  "/LTS-Registro-Viaggi/porti/conateco_fleet.mjs",
  "/LTS-Registro-Viaggi/porti/conateco_rules.mjs",
  "/LTS-Registro-Viaggi/porti/delivery_location.mjs",
  "/LTS-Registro-Viaggi/porti/driver-ui.css",
  "/LTS-Registro-Viaggi/porti/driver-ui.mjs",
  "/LTS-Registro-Viaggi/porti/favicon.svg",
  "/LTS-Registro-Viaggi/porti/index.html",
  "/LTS-Registro-Viaggi/porti/rules.mjs",
  "/LTS-Registro-Viaggi/porti/styles.css",
  "/LTS-Registro-Viaggi/porti/tfg_booking.mjs",
  "/LTS-Registro-Viaggi/porti/tfg_schedule.mjs",
  "/LTS-Registro-Viaggi/porti/tfg.mjs",
  "/LTS-Registro-Viaggi/privacy/index.html",
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
const PORT_BASE = BASE + 'porti/';
// App and account modules are network-first: a previous offline worker must
// not keep serving stale login controls after a secure release. Offline fallback
// still uses only the current static cache; personal records are never cached.
const NETWORK_FIRST_CODE = new Set([
  BASE + 'app.mjs', BASE + 'account-access.mjs', BASE + 'driver-session-vault.mjs',
  BASE + 'runtime-config.mjs', BASE + 'client-store.mjs'
]);
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
  if (url.pathname.startsWith(BASE + 'api/')) return;
  const isPort = url.pathname === PORT_BASE.slice(0, -1) || url.pathname.startsWith(PORT_BASE);
  if (isPort && (url.pathname.startsWith(PORT_BASE + 'data/') || url.pathname.endsWith('.json'))) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      if (isPort) {
        const page = await caches.match(PORT_BASE + 'index.html', { ignoreVary: true });
        if (!page) return Response.error();
        if (url.pathname !== PORT_BASE && url.pathname !== PORT_BASE + 'index.html')
          return Response.redirect(url.origin + PORT_BASE + 'index.html', 302);
        return page;
      }
      return (await caches.match(BASE + 'index.html', { ignoreVary: true })) || Response.error();
    }));
    return;
  }
  if (CORE.includes(url.pathname)) {
    if (NETWORK_FIRST_CODE.has(url.pathname)) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(request, { cache: 'reload' });
          if (!fresh.ok || fresh.redirected) throw new Error('Static module unavailable');
          // Offline cache write failures must not replace a valid fresh response.
          try { await (await caches.open(CACHE)).put(url.pathname, fresh.clone()); } catch {}
          return fresh;
        } catch {
          return (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) || Response.error();
        }
      })());
      return;
    }
    event.respondWith((async () => (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) || fetch(request))());
  }
});

// Loaded by the worker, independently of an open page.
if (typeof importScripts === 'function') importScripts(new URL('push-worker.js', self.registration.scope).href);
