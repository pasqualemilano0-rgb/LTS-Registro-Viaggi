/** Strict private-demo browser smoke. No real data, credentials or production URLs. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';

const dir=resolve(fileURLToPath(new URL('../',import.meta.url)));
const playwrightRoot=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium}=createRequire(import.meta.url)(playwrightRoot+'/node_modules/playwright');
const prefix='/LTS-Registro-Viaggi/';
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
 '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
 let path=decodeURIComponent(url.pathname.slice(prefix.length));
 if(!path||path==='amministratore/')path+=(path?'index.html':'index.html');
 const file=resolve(dir,path);
 if(!file.startsWith(dir+sep)){res.writeHead(403).end();return;}
 try{
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store'}).end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
  isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{
  if(/\.supabase\.co|chatgpt\.site/.test(request.url()))external.push(request.url().split('?')[0]);
 });
 await page.goto(origin+prefix+'amministratore/',{waitUntil:'domcontentloaded'});
 await page.locator('#dashboard').waitFor({state:'visible',timeout:20000});
 assert.match(await page.locator('.qa-private-banner').textContent(),/QA PRIVATA/);
 const admin=await page.locator('#dashboard').getAttribute('data-view');
 assert.equal(admin,'overview');
 assert.equal(await page.locator('#records-driver').count(),0,'No unknown selector is assumed');
 await page.evaluate(()=>document.getElementById('records-tab').click());
 await page.waitForFunction(()=>document.querySelector('#dashboard')?.dataset.view==='records',{timeout:15000});
 // Synthetic personal archive is loaded only from the local test adapter.
 await page.waitForFunction(()=>document.querySelector('#records-tabs')?.childElementCount>=3);
 assert.equal(external.length,0,'QA admin attempted a production API request');
 await page.goto(origin+prefix+'index.html',{waitUntil:'domcontentloaded'});
 const initial=await page.evaluate(async()=>{
  const store=await import('/LTS-Registro-Viaggi/client-store.mjs');
  window.qaStore=store;
  const record=await store.activateAccountFromSession();
  return {owner:record.user.id,pending:record.pending,customers:record.state.customers.length};
 });
 assert.equal(initial.owner,'account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(initial.pending,false);
 await context.setOffline(true);
 const draft=await page.evaluate(async()=>{
  const domain=await import('/LTS-Registro-Viaggi/shared/domain.mjs');
  const old=await window.qaStore.loadState();
  const next=domain.upsertCustomer(old.state,{id:'qa-demo-private-001',
   name:'CLIENTE QA DI PROVA',city:'NAPOLI',
   address:'VIA PROVA 123',phone:'',vat:''});
  const saved=await window.qaStore.saveState(next);
  return {pending:saved.pending,customers:saved.state.customers.length};
 });
 assert.equal(draft.pending,true);
 assert.equal(draft.customers,initial.customers+1);
 await context.setOffline(false);
 const synced=await page.evaluate(async()=>{
  const r=await window.qaStore.syncPending();
  return {pending:window.qaStore.getSyncInfo().pending,customers:r.state.customers.length};
 });
 assert.equal(synced.pending,false);
 assert.equal(synced.customers,draft.customers);
 assert.equal(external.length,0,'QA frontend attempted to contact production');
 assert.deepEqual(errors,[],'QA runtime JS errors');
 await context.close();
 console.log('PASS private QA demo: admin dashboard and offline personal archive use only synthetic local data');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
