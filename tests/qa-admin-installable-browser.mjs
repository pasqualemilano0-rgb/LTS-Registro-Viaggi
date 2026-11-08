/* Browser-level admin PWA verification on localhost: no live API calls or production records. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const pwRoot = process.env.LTS_BROWSER_PLAYWRIGHT || '/tmp/lts-browser-test';
const { chromium } = createRequire(import.meta.url)(pwRoot + '/node_modules/playwright');
const prefix = '/LTS-Registro-Viaggi/';
const types = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.png':'image/png',
  '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json'
};
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://127.0.0.1').pathname;
  if (!pathname.startsWith(prefix)) {res.writeHead(404).end();return;}
  const rel = decodeURIComponent(pathname.slice(prefix.length));
  const file = resolve(root, pathname.endsWith('/') ? rel+'index.html' : rel);
  if (!file.startsWith(root+sep) || !types[extname(file)]) {
    res.writeHead(403).end();return;
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' }).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  const context = await browser.newContext({
    viewport:{width:390,height:844},
    isMobile:true,
    hasTouch:true
  });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1).*$/, route => route.abort());
  const page = await context.newPage();
  const base = 'http://127.0.0.1:'+server.address().port + prefix;
  await page.goto(base+'amministratore/', {waitUntil:'domcontentloaded'});
  assert.match(await page.title(), /Dashboard amministratore/);
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),
    './manifest.webmanifest');
  const manifest = await (await context.request.get(base+'amministratore/manifest.webmanifest')).json();
  assert.equal(manifest.start_url,'/LTS-Registro-Viaggi/amministratore/');
  assert.equal(manifest.id,manifest.start_url);
  assert.equal(manifest.display,'standalone');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.scriptURL.endsWith('/amministratore/sw.js');
  }, null, {timeout:18000});
  await page.waitForFunction(() =>
    navigator.serviceWorker.controller?.scriptURL.endsWith('/amministratore/sw.js'),
    null,{timeout:10000});

  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cachedIndex = await caches.match('/LTS-Registro-Viaggi/amministratore/index.html');
    const cachedScript = await caches.match('/LTS-Registro-Viaggi/amministratore/admin.mjs');
    return {keys,index:!!cachedIndex,script:!!cachedScript};
  });
  assert.ok(cached.keys.some(x=>x.startsWith('lts-admin-offline-shell-')));
  assert.equal(cached.index,false,'Authentication page must never be cached');
  assert.equal(cached.script,false,'Authenticated admin logic must never be precached');

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.match(await page.locator('h1').textContent(),/Connessione necessaria/);
  assert.ok(await page.getByRole('link',{name:'Riprova ad accedere'}).isVisible());
  assert.equal(await page.locator('#login-phone').count(),0);
  await context.setOffline(false);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#login-phone').count(),1);
  console.log('PASS admin standalone PWA: correct scope, worker activation, offline no private data, online login restored');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
