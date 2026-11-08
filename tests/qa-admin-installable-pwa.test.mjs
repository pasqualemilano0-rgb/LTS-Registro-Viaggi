import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('administrator installs as its own PWA, not as the driver register', () => {
  const admin = JSON.parse(read('amministratore/manifest.webmanifest'));
  const driver = JSON.parse(read('manifest.webmanifest'));
  assert.equal(admin.id, '/LTS-Registro-Viaggi/amministratore/');
  assert.equal(admin.scope, '/LTS-Registro-Viaggi/amministratore/');
  assert.equal(admin.start_url, '/LTS-Registro-Viaggi/amministratore/');
  assert.equal(admin.display, 'standalone');
  assert.notEqual(admin.id, driver.id);
  assert.notEqual(admin.start_url, driver.start_url);
  assert.ok(admin.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(admin.icons.some(icon => icon.sizes === '512x512'));
  for (const icon of admin.icons) {
    const pathname = icon.src.replace(/^\/LTS-Registro-Viaggi\//, '');
    assert.ok(existsSync(new URL('../' + pathname, import.meta.url)), 'Missing PWA icon ' + icon.src);
  }
});

test('admin document exposes install metadata and authorizes only same-origin worker and manifest', () => {
  const html = read('amministratore/index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\.\/assets\/apple-touch-icon\.png">/);
  assert.match(html, /name="apple-mobile-web-app-title" content="LTS Admin"/);
  assert.match(html, /worker-src 'self'; manifest-src 'self'/);
  assert.match(html, /id="install-admin"[^>]*hidden/);
  assert.match(html, /src="\.\/install-pwa\.mjs\?v=/);
});

test('install button is bound to a real browser install prompt', () => {
  const installer = read('amministratore/install-pwa.mjs');
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /appinstalled/);
  assert.match(installer, /await prompt\.prompt\(\)/);
  assert.match(installer, /serviceWorker\.register\(script, \{ scope \}\)/);
  assert.match(installer, /display-mode: standalone/);
  assert.match(installer, /navigator\.standalone/);
});

test('admin worker never precaches private content or personal records', () => {
  const sw = read('amministratore/sw.js');
  const precache = sw.match(/const STATIC_OFFLINE = \[([\s\S]*?)\];/);
  assert.ok(precache);
  assert.match(precache[1], /offline\.css/);
  assert.match(precache[1], /manifest\.webmanifest/);
  assert.doesNotMatch(precache[1], /admin\.mjs|index\.html|account|driver|trip|report|token|session/i);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /event\.respondWith\(fetch\(request, \{ cache: 'no-store' \}\)\.catch/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /ADMIN_CACHE_PREFIX/);
  assert.doesNotMatch(sw, /\.\.\/sw\.js|push-worker|caches\.match\(request/);
  assert.ok(existsSync(new URL('../amministratore/offline.html', import.meta.url)));
  assert.ok(existsSync(new URL('../amministratore/offline.css', import.meta.url)));
  const offline = read('amministratore/offline.html');
  assert.match(offline, /Connessione necessaria/);
  assert.doesNotMatch(offline, /admin\.mjs|account-access|token|localStorage|indexedDB/);
});
