/** Chromium PWA smoke with synthetic data only. No production credentials or writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const prefix='/LTS-Registro-Viaggi/';
const runner=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium}=createRequire(import.meta.url)(runner+'/node_modules/playwright');
const mime={
 '.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.webp':'image/webp','.woff2':'font/woff2',
 '.webmanifest':'application/manifest+json'
};
const previousWorker="const BASE = \"/LTS-Registro-Viaggi/\";\nconst PREFIX = \"lts-iphone-pages-0aa8d087d02b-\";\nconst CACHE = PREFIX + '20261126-admin-notes-visible-v1';\nconst CORE = [\n  \"/LTS-Registro-Viaggi/account-access.mjs\",\n  \"/LTS-Registro-Viaggi/app.css\",\n  \"/LTS-Registro-Viaggi/visual-theme.css\",\n  \"/LTS-Registro-Viaggi/activation-feedback.css\",\n  \"/LTS-Registro-Viaggi/truck-loader.css\",\n  \"/LTS-Registro-Viaggi/photo-splash.css\",\n  \"/LTS-Registro-Viaggi/login-premium.css\",\n  \"/LTS-Registro-Viaggi/assets/lts-login-hero-hd.webp\",\n  \"/LTS-Registro-Viaggi/assets/lts-full-photo-hd.webp\",\n  \"/LTS-Registro-Viaggi/assets/lts-scania-s-loader.svg\",\n  \"/LTS-Registro-Viaggi/app.mjs\",\n  \"/LTS-Registro-Viaggi/assets/apple-touch-icon.png\",\n  \"/LTS-Registro-Viaggi/assets/icon-192.png\",\n  \"/LTS-Registro-Viaggi/assets/icon-512.png\",\n  \"/LTS-Registro-Viaggi/assets/login-harbor.svg\",\n  \"/LTS-Registro-Viaggi/assets/lts-logo-pdf.png\",\n  \"/LTS-Registro-Viaggi/assets/lts-logo.png\",\n  \"/LTS-Registro-Viaggi/assets/vendor/fflate.mjs\",\n  \"/LTS-Registro-Viaggi/assets/vendor/jspdf.plugin.autotable.min.js\",\n  \"/LTS-Registro-Viaggi/assets/vendor/jspdf.umd.min.js\",\n  \"/LTS-Registro-Viaggi/client-store.mjs\",\n  \"/LTS-Registro-Viaggi/shared-maps-client.mjs\",\n  \"/LTS-Registro-Viaggi/maps-reader-client.mjs\",\n  \"/LTS-Registro-Viaggi/shared/maps-company-routing.mjs\",\n  \"/LTS-Registro-Viaggi/shared/customer-site-matches.mjs\",\n  \"/LTS-Registro-Viaggi/driver-session-vault.mjs\",\n  \"/LTS-Registro-Viaggi/driver-session-guard.mjs\",\n  \"/LTS-Registro-Viaggi/index.html\",\n  \"/LTS-Registro-Viaggi/viaggi/index.html\",\n  \"/LTS-Registro-Viaggi/manifest.webmanifest\",\n  \"/LTS-Registro-Viaggi/porti-access.mjs\",\n  \"/LTS-Registro-Viaggi/porti/app.js\",\n  \"/LTS-Registro-Viaggi/porti/assets/lts-logo.png\",\n  \"/LTS-Registro-Viaggi/porti/assets/terminal-logos/conateco.png\",\n  \"/LTS-Registro-Viaggi/porti/assets/terminal-logos/sct-compact.png\",\n  \"/LTS-Registro-Viaggi/porti/assets/terminal-logos/tfg-portal.png\",\n  \"/LTS-Registro-Viaggi/porti/booking_search.mjs\",\n  \"/LTS-Registro-Viaggi/porti/conateco_booking.mjs\",\n  \"/LTS-Registro-Viaggi/porti/conateco_fleet.mjs\",\n  \"/LTS-Registro-Viaggi/porti/conateco_rules.mjs\",\n  \"/LTS-Registro-Viaggi/porti/delivery_location.mjs\",\n  \"/LTS-Registro-Viaggi/porti/driver-ui.css\",\n  \"/LTS-Registro-Viaggi/porti/driver-ui.mjs\",\n  \"/LTS-Registro-Viaggi/porti/favicon.svg\",\n  \"/LTS-Registro-Viaggi/porti/index.html\",\n  \"/LTS-Registro-Viaggi/porti/rules.mjs\",\n  \"/LTS-Registro-Viaggi/porti/styles.css\",\n  \"/LTS-Registro-Viaggi/porti/tfg_booking.mjs\",\n  \"/LTS-Registro-Viaggi/porti/tfg_schedule.mjs\",\n  \"/LTS-Registro-Viaggi/porti/tfg.mjs\",\n  \"/LTS-Registro-Viaggi/privacy/index.html\",\n  \"/LTS-Registro-Viaggi/push-client.mjs\",\n  \"/LTS-Registro-Viaggi/push-worker.js\",\n  \"/LTS-Registro-Viaggi/runtime-config.mjs\",\n  \"/LTS-Registro-Viaggi/realtime-client.mjs\",\n  \"/LTS-Registro-Viaggi/shared/android-backup-export.mjs\",\n  \"/LTS-Registro-Viaggi/shared/android-backup.mjs\",\n  \"/LTS-Registro-Viaggi/shared/customer-csv.mjs\",\n  \"/LTS-Registro-Viaggi/shared/domain.mjs\",\n  \"/LTS-Registro-Viaggi/shared/company-fares.mjs\",\n  \"/LTS-Registro-Viaggi/shared/company-extras.mjs\",\n  \"/LTS-Registro-Viaggi/shared/maps-client.mjs\",\n  \"/LTS-Registro-Viaggi/shared/trip-customer-choices.mjs\",\n  \"/LTS-Registro-Viaggi/shared/pdf.mjs\",\n  \"/LTS-Registro-Viaggi/shared/port-source-status.mjs\",\n  \"/LTS-Registro-Viaggi/shared/quick-trip.mjs\",\n  \"/LTS-Registro-Viaggi/shared/trip-editor-safety.mjs\",\n  \"/LTS-Registro-Viaggi/shared/register-explorer.mjs\",\n  \"/LTS-Registro-Viaggi/shared/sync-merge.mjs\",\n  \"/LTS-Registro-Viaggi/shared/backup-conflict-details.mjs\",\n  \"/LTS-Registro-Viaggi/shared/foreground-resume.mjs\",\n  \"/LTS-Registro-Viaggi/shared/vendor/fflate.mjs\",\n  \"/LTS-Registro-Viaggi/shell.html\"\n];\nconst PORT_BASE = BASE + 'porti/';\n// App and account modules are network-first: a previous offline worker must\n// not keep serving stale login controls after a secure release. Offline fallback\n// still uses only the current static cache; personal records are never cached.\nconst NETWORK_FIRST_CODE = new Set([\n  BASE + 'push-client.mjs',\n  BASE + 'app.css', BASE + 'visual-theme.css',\n  BASE + 'app.mjs', BASE + 'driver-session-guard.mjs', BASE + 'porti-access.mjs', BASE + 'account-access.mjs', BASE + 'driver-session-vault.mjs',\n  BASE + 'runtime-config.mjs', BASE + 'client-store.mjs', BASE + 'realtime-client.mjs', BASE + 'porti/app.js',\n  BASE + 'shared/quick-trip.mjs', BASE + 'shared/trip-customer-choices.mjs', BASE + 'shared/trip-editor-safety.mjs', BASE + 'shared/register-explorer.mjs', BASE + 'shared/maps-company-routing.mjs',\n  BASE + 'shared/customer-site-matches.mjs', BASE + 'shared/foreground-resume.mjs', BASE + 'shared/backup-conflict-details.mjs', BASE + 'shared/sync-merge.mjs', BASE + 'shared-maps-client.mjs',\n  BASE + 'maps-reader-client.mjs',\n  BASE + 'shared/company-fares.mjs', BASE + 'shared/company-extras.mjs', BASE + 'shared/domain.mjs', BASE + 'shared/pdf.mjs'\n]);\nself.addEventListener('install', event => {\n  event.waitUntil((async () => {\n    const cache = await caches.open(CACHE);\n    for (const url of CORE) {\n      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });\n      if (!response.ok || response.redirected) throw new Error('Preparazione della modalità offline non completata.');\n      await cache.put(url, response);\n    }\n    await self.skipWaiting();\n  })());\n});\nself.addEventListener('activate', event => {\n  event.waitUntil((async () => {\n    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);\n    await self.clients.claim();\n  })());\n});\nself.addEventListener('fetch', event => {\n  const request = event.request;\n  const url = new URL(request.url);\n  // The API is on a separate origin. Never cache personal records or API calls.\n  if (url.origin !== self.location.origin || request.method !== 'GET' || !url.pathname.startsWith(BASE)) return;\n  if (url.pathname.startsWith(BASE + 'api/')) return;\n  // Never supply a driver shell or cache response to the separate admin app.\n  if (['amministratore','status'].some(area => url.pathname === BASE + area || url.pathname.startsWith(BASE + area + '/'))) return;\n  // Personal document pages remain online-only; never replace them with a cached register.\n  if (['documenti','viaggi/documenti'].some(area => url.pathname === BASE + area || url.pathname.startsWith(BASE + area + '/'))) return;\n  const isPort = url.pathname === PORT_BASE.slice(0, -1) || url.pathname.startsWith(PORT_BASE);\n  if (isPort && (url.pathname.startsWith(PORT_BASE + 'data/') || url.pathname.endsWith('.json'))) return;\n  if (request.mode === 'navigate') {\n    // An old browser HTTP cache may hold Porti/index.html and its original import URLs.\n    // Always revalidate the Porti document when connected, retaining offline fallback.\n    event.respondWith(fetch(request, { cache: isPort ? 'reload' : 'default' }).catch(async () => {\n      if (isPort) {\n        const page = await caches.match(PORT_BASE + 'index.html', { ignoreVary: true });\n        if (!page) return Response.error();\n        if (url.pathname !== PORT_BASE && url.pathname !== PORT_BASE + 'index.html')\n          return Response.redirect(url.origin + PORT_BASE + 'index.html', 302);\n        return page;\n      }\n      if ([BASE+'viaggi/',BASE+'viaggi/index.html'].includes(url.pathname))\n        return (await caches.match(BASE+'viaggi/index.html', { ignoreVary: true })) || Response.error();\n      if (![BASE,BASE+'index.html',BASE+'shell.html',BASE+'shell'].includes(url.pathname)) return Response.error();\n      return (await caches.match(BASE + 'index.html', { ignoreVary: true })) || Response.error();\n    }));\n    return;\n  }\n  if (CORE.includes(url.pathname)) {\n    // Porti modules were previously cache-first, so versioned import URLs could\n    // still receive old CO.NA.TE.CO. evaluation code from Cache Storage.\n    // Load all Porti scripts and styles network-first, ignoring HTTP cache.\n    // Only use the new precache when offline; never cache live terminal JSON.\n    const isPortCode = isPort && /\\.(?:mjs|js|css)$/.test(url.pathname);\n    if (NETWORK_FIRST_CODE.has(url.pathname) || isPortCode) {\n      event.respondWith((async () => {\n        try {\n          const fresh = await fetch(request, { cache: 'reload' });\n          if (!fresh.ok || fresh.redirected) throw new Error('Static module unavailable');\n          // Offline cache write failures must not replace a valid fresh response.\n          try { await (await caches.open(CACHE)).put(url.pathname, fresh.clone()); } catch {}\n          return fresh;\n        } catch {\n          return (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) || Response.error();\n        }\n      })());\n      return;\n    }\n    event.respondWith((async () => (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) || fetch(request))());\n  }\n});\n\n// Loaded by the worker, independently of an open page.\nif (typeof importScripts === 'function') importScripts(new URL('push-worker.js', self.registration.scope).href);\n";
let previous=true;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!url.pathname.startsWith(prefix)){
  res.writeHead(404).end('Not found');return;
 }
 const relative=decodeURIComponent(url.pathname.slice(prefix.length));
 if(relative==='qa-worker.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'})
   .end('<!doctype html><html><meta charset="utf-8"><title>QA SW</title><body>QA offline verification only</body></html>');
  return;
 }
 if(relative==='api/qa-private-marker'){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
   .end(JSON.stringify({fake:true,data:'synthetic-private-never-cache'}));return;
 }
 if(relative==='sw.js'&&previous){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(previousWorker);return;}
 const file=resolve(root,relative.endsWith('/')?relative+'index.html':relative||'index.html');
 if(!file.startsWith(root+sep)){
  res.writeHead(403).end('Forbidden');return;
 }
 try{
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
   'Cache-Control':'no-cache'}).end(body);
 }catch{
  res.writeHead(404).end('Not found');
 }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'allow'});
 const page=await context.newPage();
 await page.goto(origin+prefix+'qa-worker.html',{waitUntil:'load'});
 await page.evaluate(async()=>{
  await navigator.serviceWorker.register('/LTS-Registro-Viaggi/sw.js',{
   scope:'/LTS-Registro-Viaggi/'
  });
  await Promise.race([
   navigator.serviceWorker.ready,
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Worker install timed out')),45000))
  ]);
 });
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:45000});
 const oldCache='lts-iphone-pages-0aa8d087d02b-20261126-admin-notes-visible-v1';
 const newCache='lts-iphone-pages-0aa8d087d02b-20261127-cnt-v3-payroll-badge-v2';
 const synthetic={owner:'account:qa-migration',pending:true,state:{trips:[{id:'qa-trip',note:'Synthetic offline trip'}],customers:[{id:'qa-customer'}]}};
 await page.evaluate(async record=>{
  const req=indexedDB.open('lts-registro-iphone-v1',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('records');
  const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
  try{await new Promise((ok,fail)=>{const tx=db.transaction('records','readwrite');tx.oncomplete=ok;tx.onerror=()=>fail(tx.error);tx.objectStore('records').put(record,record.owner);});}finally{db.close();}
  await (await caches.open('qa-unrelated-cache')).put('/qa-marker',new Response('preserve'));
 },synthetic);
 assert((await page.evaluate(()=>caches.keys())).includes(oldCache));
 previous=false;
 await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  const changed=new Promise(ok=>navigator.serviceWorker.addEventListener('controllerchange',ok,{once:true}));
  await reg.update();
  await Promise.race([changed,new Promise((_,fail)=>setTimeout(()=>fail(Error('Worker migration timeout')),45000))]);
 });
 await page.waitForFunction(async names=>{const keys=await caches.keys();return keys.includes(names[1])&&!keys.includes(names[0]);},[oldCache,newCache],{timeout:45000});
 await page.reload({waitUntil:'load'});
 const preserved=await page.evaluate(async owner=>{
  const req=indexedDB.open('lts-registro-iphone-v1',1);
  const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
  try{return await new Promise((ok,fail)=>{const q=db.transaction('records','readonly').objectStore('records').get(owner);q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error);});}finally{db.close();}
 },synthetic.owner);
 assert.deepEqual(preserved,synthetic,'IndexedDB record must survive actual worker migration and reload');
 assert.equal(await page.evaluate(async()=>await (await (await caches.open('qa-unrelated-cache')).match('/qa-marker')).text()),'preserve');
 console.log('PASS real previous-to-candidate worker migration: IndexedDB record and unrelated cache preserved, old cache removed');
 const cached=await page.evaluate(async()=>{
  const keys=await caches.keys();
  const entry=keys.find(value=>value.startsWith('lts-iphone-pages-'));
  if(!entry)return {count:0,keys};
  const items=await(await caches.open(entry)).keys();
  return {count:items.length,keys};
 });
 assert(cached.count>=45,'Offline worker must precache real files: '+JSON.stringify(cached));
 const privateOnline=await page.evaluate(async()=>{
  const response=await fetch('/LTS-Registro-Viaggi/api/qa-private-marker');
  return {status:response.status,body:await response.json()};
 });
 assert.equal(privateOnline.status,200);
 assert.equal(privateOnline.body.fake,true);
 assert.equal(await page.evaluate(async()=>Boolean(
  await caches.match('/LTS-Registro-Viaggi/api/qa-private-marker'))),false,
  'Protected API JSON must never enter the Cache API');
 await context.setOffline(true);
 const offline=await page.evaluate(async()=>{
  const style=await fetch('/LTS-Registro-Viaggi/visual-theme.css?cachebust=qa-offline');
  const css=await style.text();
  const module=await fetch('/LTS-Registro-Viaggi/app.mjs?v=qa-offline');
  const script=await module.text();
  let protectedApiWasBlocked=false;
  try{await fetch('/LTS-Registro-Viaggi/api/qa-private-marker');}
  catch{protectedApiWasBlocked=true;}
  return {
   css:style.status,cssValid:css.includes('records-certify-panel'),
   module:module.status,moduleValid:script.includes('renderRegister'),
   protectedApiWasBlocked
  };
 });
 assert.deepEqual(offline,{
  css:200,cssValid:true,module:200,moduleValid:true,protectedApiWasBlocked:true
 });
 const response=await page.goto(origin+prefix+'index.html',{
  waitUntil:'domcontentloaded',timeout:25000
 });
 assert.equal(response?.status(),200,'PWA navigation must use cached index when offline');
 assert.match(await page.title(),/LTS/);
 assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
 const scoped=await page.goto(origin+prefix+'viaggi/',{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(scoped?.status(),200,'Dedicated driver path must remain usable offline');
 assert.equal(new URL(page.url()).pathname,prefix+'viaggi/');
 assert.match(await page.title(),/LTS/);
 await assert.rejects(page.goto(origin+prefix+'viaggi/documenti/',{waitUntil:'domcontentloaded',timeout:15000}),
  'Personal documents must not be replaced by the driver shell offline');
 await context.setOffline(false);
 await page.goto(origin+prefix+'viaggi/',{waitUntil:'domcontentloaded'});
 const manifest=await (await context.request.get(origin+prefix+'manifest.webmanifest')).json();
 assert.equal(manifest.start_url,prefix+'viaggi/');
 assert.equal(manifest.scope,prefix+'viaggi/');
 assert.equal(manifest.id,prefix);
 const docs=await context.request.get(origin+prefix+'viaggi/documenti/');
 assert.equal(docs.status(),200);
 assert.match(await docs.text(),/I miei documenti/);
 await page.close();
 await context.close();
 console.log('PASS offline PWA: real worker install, cached navigation, CSS/JS, private API bypass');
} finally {
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
