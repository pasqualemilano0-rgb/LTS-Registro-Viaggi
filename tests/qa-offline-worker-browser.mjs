/** Chromium PWA smoke with synthetic data only. No production credentials or writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
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
 const file=resolve(root,relative||'index.html');
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
 await context.setOffline(false);
 await page.close();
 await context.close();
 console.log('PASS offline PWA: real worker install, cached navigation, CSS/JS, private API bypass');
} finally {
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
