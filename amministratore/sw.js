/* LTS Admin: dedicated, narrow-scope installable shell.
 * Online authentication/MFA is ALWAYS required. Never cache private data.
 */
const ADMIN_BASE = '/LTS-Registro-Viaggi/amministratore/';
const ADMIN_CACHE_PREFIX = 'lts-admin-offline-shell-';
const ADMIN_CACHE = ADMIN_CACHE_PREFIX + '20261108-pwa-v1';
const OFFLINE_PATH = ADMIN_BASE + 'offline.html';
const STATIC_OFFLINE = [
  OFFLINE_PATH,
  ADMIN_BASE + 'offline.css',
  ADMIN_BASE + 'manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(ADMIN_CACHE);
    for (const path of STATIC_OFFLINE) {
      const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.redirected) throw new Error('Offline admin shell unavailable');
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(ADMIN_CACHE_PREFIX) && key !== ADMIN_CACHE) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(ADMIN_BASE)) return;

  // Use the network for every real admin page, module and authenticated request.
  // Only a generic, account-free offline notice is available without internet.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () =>
      (await caches.match(OFFLINE_PATH)) || Response.error()
    ));
    return;
  }

  if (STATIC_OFFLINE.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match(url.pathname)) || Response.error()
    ));
  }
});
