/** End-to-end offline IndexedDB/outbox regression with synthetic records only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';
import {emptyState,validateState} from '../shared/domain.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const runner=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium,webkit}=createRequire(import.meta.url)(runner+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const prefix='/LTS-Registro-Viaggi/';
const owner='account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let revision=1,remoteState=emptyState(),requests=0;
const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
const mockAccount=[
 "export const isEnabled=()=>true;",
 "export const isVerified=()=>true;",
 "export const verifySession=async()=>({user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});",
 "export async function archiveRequest(method,body){",
 " const offline=()=>{const e=new Error('Copia locale: rete offline');e.offline=true;return e;};",
 " if(!navigator.onLine)throw offline();",
 " let response;",
 " try{response=await fetch('/LTS-Registro-Viaggi/api/qa-archive',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}",
 " catch{throw offline();}",
 " const json=await response.json();",
 " if(!response.ok){const e=new Error(json.error||'Remote rejected');e.status=response.status;throw e;}",
 " return json;",
 "}"
].join('\n');
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end('No route');return;}
 const relative=decodeURIComponent(url.pathname.slice(prefix.length));
 if(relative==='qa-store.html'){
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'})
   .end('<!doctype html><html lang="it"><meta charset="utf-8"><title>QA outbox</title><body>Only synthetic test data</body></html>');
  return;
 }
 if(relative==='account-access.mjs'){
  res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(mockAccount);return;
 }
 if(relative==='api/qa-archive'){
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  const answer=(code,value)=>res.writeHead(code).end(JSON.stringify(value));
  if(req.method==='GET')return answer(200,{user:{id:owner,linked:true},revision,
   state:remoteState,updatedAt:new Date().toISOString(),linked:true});
  if(req.method!=='POST')return answer(405,{error:'Method not allowed'});
  let body='';
  for await(const chunk of req)body+=chunk;
  let data;
  try{data=JSON.parse(body)}catch{return answer(400,{error:'Bad JSON'});}
  if(data.expectedUserId!==owner)return answer(403,{error:'Wrong archive owner'});
  if(data.baseRevision!==revision)return answer(409,{error:'Revision conflict'});
  if(!data.requestId)return answer(400,{error:'Missing idempotency ID'});
  try{remoteState=validateState(data.state)}
  catch(error){return answer(422,{error:error.message});}
  revision++;requests++;
  return answer(200,{user:{id:owner,linked:true},revision,
   state:remoteState,updatedAt:new Date().toISOString(),linked:true});
 }
 const file=resolve(root,relative||'index.html');
 if(!file.startsWith(root+sep)){res.writeHead(403).end('Forbidden');return;}
 try{
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store'}).end(body);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();
 const url='http://127.0.0.1:'+server.address().port+prefix+'qa-store.html';
 await page.goto(url,{waitUntil:'load'});
 const start=await page.evaluate(async()=>{
  window.qaStore=await import('/LTS-Registro-Viaggi/client-store.mjs');
  window.qaDomain=await import('/LTS-Registro-Viaggi/shared/domain.mjs');
  const record=await window.qaStore.activateAccountFromSession();
  return {revision:record.revision,tripCount:record.state.trips.length,
   pending:window.qaStore.getSyncInfo().pending};
 });
 assert.deepEqual(start,{revision:1,tripCount:0,pending:false});
 // A partially typed trip survives a full PWA reload and is never sent to the server.
 const localDraft={version:1,editingId:null,editingBaseline:null,draft:{
  date:'2026-11-09',client:'CLIENTE BOZZA',city:'NAPOLI',
  container:'',secondClient:'',secondCity:'',second:false,
  note:'NOTE LOCALI',services:[],noteOpen:true,servicesOpen:false
 }};
 await page.evaluate(value=>window.qaStore.saveTripEditorDraft(value),localDraft);
 assert.equal((await page.evaluate(()=>window.qaStore.readTripEditorDraft())).draft.client,'CLIENTE BOZZA');
 await page.reload({waitUntil:'load'});
 const afterReload=await page.evaluate(async()=>{
  window.qaStore=await import('/LTS-Registro-Viaggi/client-store.mjs');
  window.qaDomain=await import('/LTS-Registro-Viaggi/shared/domain.mjs');
  await window.qaStore.activateAccountFromSession();
  return window.qaStore.readTripEditorDraft();
 });
 assert.deepEqual(afterReload,localDraft,'The complete editor scratchpad must survive a reload');
 assert.equal(requests,0,'Local drafts must not produce remote archive writes');
 await page.evaluate(()=>window.qaStore.clearTripEditorDraft());
 assert.equal(await page.evaluate(()=>window.qaStore.readTripEditorDraft()),null);
 await context.setOffline(true);
 const edited=await page.evaluate(async()=>{
  const store=window.qaStore,domain=window.qaDomain;
  const snapshot=await store.loadState();
  let next=domain.upsertCustomer(snapshot.state,{
   id:'customer-offline',name:'CLIENTE QA OFFLINE',city:'NAPOLI',
   address:'VIA SINTETICA 1',phone:'',vat:''
  });
  next.trips.push(domain.createTrip({
   date:'2026-11-08',client:'CLIENTE QA OFFLINE',city:'NAPOLI',
   container:'ABCD1234567',secondClient:'',secondCity:'',
   services:[],note:'BOZZA OFFLINE'
  },next));
  const first=await store.saveState(next);
  const secondState=structuredClone(first.state);
  secondState.trips[0].note='MODIFICA SUCCESSIVA OFFLINE';
  const second=await store.saveState(secondState);
  return {firstPending:first.pending,secondPending:second.pending,
   note:second.state.trips[0].note,sync:store.getSyncInfo()};
 });
 assert.equal(edited.firstPending,true);
 assert.equal(edited.secondPending,true);
 assert.equal(edited.note,'MODIFICA SUCCESSIVA OFFLINE');
 assert.equal(edited.sync.pending,true);
 const onDevice=await page.evaluate(async()=>{
  const req=indexedDB.open('lts-registro-iphone-v1',1);
  const db=await new Promise((resolve,reject)=>{
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
  });
  try{
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readonly');
    const q=tx.objectStore('records').get('account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    q.onsuccess=()=>resolve(q.result);
    q.onerror=()=>reject(q.error);
   });
  }finally{db.close();}
 });
 assert.equal(onDevice.pending,true);
 assert.equal(onDevice.state.customers.length,1);
 assert.equal(onDevice.state.trips.length,1);
 assert.equal(onDevice.state.trips[0].note,'MODIFICA SUCCESSIVA OFFLINE');
 assert.equal(requests,0,'An offline edit must not reach any server');
 await context.setOffline(false);
 const saved=await page.evaluate(async()=>{
  const result=await window.qaStore.syncPending();
  return {pending:window.qaStore.getSyncInfo().pending,revision:result.revision,
   tripCount:result.state.trips.length,note:result.state.trips[0].note};
 });
 assert.equal(saved.pending,false);
 assert.equal(saved.tripCount,1);
 assert.equal(saved.note,'MODIFICA SUCCESSIVA OFFLINE');
 assert.equal(remoteState.trips.length,1);
 assert.equal(remoteState.trips[0].note,'MODIFICA SUCCESSIVA OFFLINE');
 assert.equal(remoteState.customers.length,1);
 assert.equal(requests,2,'Immutable first outbox and second offline edit must both sync');
 console.log('PASS '+engine+' IndexedDB offline: two edits persist, network resumes, immutable outbox syncs exactly twice');
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
