/** Real IndexedDB and real account-access boundaries; synthetic accounts only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {emptyState,validateState} from '../shared/domain.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const runner=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium,webkit}=createRequire(import.meta.url)(runner+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const prefix='/LTS-Registro-Viaggi/',ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',TOKEN='A'.repeat(85),OTHER='B'.repeat(85);
const owner='account:'+ID;
const initial={...emptyState(),profile:{firstName:'BASE',lastName:'BASE'}};
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname===prefix+'qa-cas.html')return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Archive consistency</title>');
 if(!pathname.startsWith(prefix))return res.writeHead(404).end();
 const file=resolve(root,decodeURIComponent(pathname.slice(prefix.length)));
 if(!file.startsWith(root+sep))return res.writeHead(403).end();
 try{res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain','Cache-Control':'no-store'}).end(await readFile(file));}
 catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+prefix+'qa-cas.html';
const deferred=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return {promise,resolve};};
let browser;
async function setup(){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'locks',{value:undefined});
  Object.defineProperty(document,'hidden',{get:()=>true});
  window.BroadcastChannel=undefined;
 });
 const archives=new Map([[ID,{state:structuredClone(initial),revision:1}]]),receipts=new Map();
 let hold=null,authMode='driver',archiveRequests=0;
 const record=id=>{if(!archives.has(id))archives.set(id,{state:emptyState(),revision:1});return archives.get(id);};
 await context.route('https://**/*',async route=>{
  const req=route.request(),endpoint=new URL(req.url()).pathname;
  if(!req.url().startsWith('https://otrqynkscpbeyuvdlgpg.supabase.co/'))return route.abort();
  const bearer=req.headers().authorization;
  assert.ok(bearer==='Bearer '+TOKEN||bearer==='Bearer '+OTHER,'Actual authenticated request must carry its session bearer');
  const id=bearer==='Bearer '+OTHER?SECOND:ID;
  if(endpoint.endsWith('/lts-phone-auth'))return route.fulfill({json:{active:true,user_id:id,role:authMode==='mfa'?'admin':'driver',...(authMode==='mfa'?{mfa_enrolled:true,mfa_verified:false}:{})}});
  if(!endpoint.endsWith('/lts-account-state'))return route.abort();
  archiveRequests++;
  const body=req.postDataJSON(),archive=record(id);
  let response;
  if(body.action==='read')response={user:{id:'account:'+id},revision:archive.revision,state:structuredClone(archive.state)};
  else{
   assert.equal(body.expectedUserId,'account:'+id);
   const prior=receipts.get(id+':'+body.requestId);
   if(prior)response=structuredClone(prior);
   else{
    if(body.baseRevision!==archive.revision)return route.fulfill({status:409,json:{error:'Synthetic revision conflict'}});
    archive.state=validateState(body.state);archive.revision++;
    response={user:{id:'account:'+id},revision:archive.revision,state:structuredClone(archive.state)};
    receipts.set(id+':'+body.requestId,structuredClone(response));
   }
  }
  if(hold&&hold.action===body.action){const waiting=hold;hold=null;waiting.started.resolve();await waiting.release.promise;}
  await route.fulfill({json:response});
 });
 const open=async({id=ID,token=TOKEN,activate=true}={})=>{
  const page=await context.newPage();await page.goto(url);
  await page.evaluate(({id,token})=>sessionStorage.setItem('lts-supabase-account-session-v1',JSON.stringify({user_id:id,role:'driver',access_token:token,refresh_token:'R'.repeat(50),expires_in:86400,expires_at:Date.now()+86400000})),{id,token});
  await page.evaluate(async()=>{
   window.store=await import('/LTS-Registro-Viaggi/client-store.mjs');window.auth=await import('/LTS-Registro-Viaggi/account-access.mjs');
   window.outcome=async task=>{try{return {ok:true,value:await task()};}catch(error){return {ok:false,message:error.message,code:error.code,recoveryId:error.recoveryId};}};
   window.persisted=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('lts-registro-iphone-v1',1);req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('records','readonly'),r=tx.objectStore('records').get('account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>{db.close();resolve(value);};};
   });
  });
  if(activate)await page.evaluate(async()=>window.snapshot=await store.activateAccountFromSession());
  return page;
 };
 return {context,open,archives,receipts,setAuthMode(value){authMode=value;},get requests(){return archiveRequests;},pause(action){hold={action,started:deferred(),release:deferred()};return hold;}};
}
const save=(page,field,value)=>page.evaluate(({field,value})=>{
 const state=structuredClone(window.snapshot.state);state.profile[field]=value;
 return outcome(()=>store.saveState(state));
},{field,value});
try{
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.LTS_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 // Authentication and MFA remain real gates, including local recovery metadata.
 {
  const t=await setup(),p=await t.open({activate:false});
  const denied=await p.evaluate(async()=>({verified:auth.isVerified(),load:await outcome(()=>store.loadState()),recover:await outcome(()=>store.listRecoveryCopies()),save:await outcome(()=>store.saveState({}))}));
  assert.equal(denied.verified,false);for(const key of ['load','recover','save'])assert.equal(denied[key].ok,false);
  assert.equal(t.requests,0);
  t.setAuthMode('mfa');const mfa=await p.evaluate(()=>outcome(()=>store.activateAccountFromSession()));
  assert.equal(mfa.ok,false);assert.equal(await p.evaluate(()=>auth.isVerified()),false);assert.equal(t.requests,0);
  await t.context.close();
 }
 // Two offline tabs race from the same baseline without Web Locks.
 {
  const t=await setup(),a=await t.open(),b=await t.open();await t.context.setOffline(true);
  const results=await Promise.all([save(a,'firstName','TAB A'),save(b,'lastName','TAB B')]);
  assert.equal(results.filter(r=>r.ok&&r.value.pending===true).length,1);
  assert.equal(results.filter(r=>!r.ok&&r.code==='LTS_LOCAL_CONFLICT').length,1);
  const disk=await a.evaluate(()=>persisted()),copies=await a.evaluate(()=>store.listRecoveryCopies());
  assert.equal(copies.length,1);assert.equal(await a.evaluate(()=>store.getSyncInfo().recoveryCount),1);
  const exported=JSON.parse(await a.evaluate(id=>store.exportRecoveryCopy(id),copies[0].id));
  assert.equal(exported.recovery.candidate.outbox.requestId.length,36);
  assert.equal(exported.recovery.candidate.pending,true);
  assert.notDeepEqual(exported.data.profile,disk.state.profile);
  assert.equal((await a.evaluate(id=>outcome(()=>store.applyRecoveryCopy(id)),copies[0].id)).ok,false);
  const merged=await a.evaluate(id=>store.applyRecoveryCopy(id,{confirm:true}),copies[0].id);
  assert.deepEqual(merged.state.profile,{firstName:'TAB A',lastName:'TAB B'});
  assert.deepEqual(merged.outbox,disk.outbox,'Existing immutable outbox must survive recovery application');
  assert.equal((await a.evaluate(()=>store.listRecoveryCopies())).length,1);
  assert.equal((await a.evaluate(id=>outcome(()=>store.deleteRecoveryCopy(id)),copies[0].id)).ok,false);
  await a.evaluate(id=>store.deleteRecoveryCopy(id,{confirm:true}),copies[0].id);
  assert.equal(await a.evaluate(()=>store.getSyncInfo().recoveryCount),0);
  await t.context.close();
 }
 // A suspended GET cannot replace an offline edit committed by another tab.
 {
  const t=await setup(),a=await t.open(),b=await t.open(),gate=t.pause('read');
  const loading=a.evaluate(()=>outcome(()=>store.loadState()));await gate.started.promise;
  await t.context.setOffline(true);assert.equal((await save(b,'lastName','DURABLE B')).ok,true);
  const winner=await b.evaluate(()=>persisted());await t.context.setOffline(false);gate.release.resolve();
  const result=await loading;assert.equal(result.code,'LTS_LOCAL_CONFLICT');
  assert.deepEqual(await b.evaluate(()=>persisted()),winner);
  assert.equal((await b.evaluate(()=>store.listRecoveryCopies())).length,1);
  await t.context.close();
 }
 // A suspended POST acknowledgement cannot erase later local changes/outbox.
 {
  const t=await setup(),a=await t.open(),b=await t.open(),gate=t.pause('write');
  const saving=save(a,'firstName','POST A');await gate.started.promise;
  await t.context.setOffline(true);
  await b.evaluate(async()=>window.snapshot=await store.loadState());
  assert.equal((await save(b,'lastName','LATER B')).ok,true);
  const winner=await b.evaluate(()=>persisted());await t.context.setOffline(false);gate.release.resolve();
  const result=await saving;assert.equal(result.code,'LTS_LOCAL_CONFLICT');
  assert.deepEqual(await b.evaluate(()=>persisted()),winner);
  const copies=await b.evaluate(()=>store.listRecoveryCopies());
  const recovery=JSON.parse(await b.evaluate(id=>store.exportRecoveryCopy(id),copies[0].id)).recovery;
  assert.deepEqual(recovery.queuedRecord.outbox,winner.outbox,'Recovery keeps acknowledged immutable request too');
  const synced=await b.evaluate(()=>store.syncPending());
  assert.equal(synced.pending,false);assert.deepEqual(synced.state.profile,{firstName:'POST A',lastName:'LATER B'});
  assert.deepEqual(t.archives.get(ID).state.profile,synced.state.profile);
  await t.context.close();
 }
 // Actual readwrite abort rolls back the record and never reports pending success.
 {
  const t=await setup(),a=await t.open(),before=await a.evaluate(()=>persisted());await t.context.setOffline(true);
  await a.evaluate(()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(this.name==='records'){IDBObjectStore.prototype.put=original;this.transaction.abort();}return request;};
  });
  const result=await save(a,'firstName','ABORTED');assert.equal(result.ok,false);assert.equal(result.code,'LTS_LOCAL_STORAGE');
  assert.deepEqual(await a.evaluate(()=>persisted()),before);
  assert.equal(await a.evaluate(()=>store.getSyncInfo().pending),false);
  assert.equal((await a.evaluate(()=>store.listRecoveryCopies())).length,0);
  await t.context.close();
 }
 // Recovery quota/abort never erases the winner or claims the losing copy was saved.
 {
  const t=await setup(),a=await t.open(),b=await t.open();await t.context.setOffline(true);
  assert.equal((await save(a,'firstName','WINNER')).ok,true);
  const winner=await a.evaluate(()=>persisted());
  await b.evaluate(()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(this.name==='meta'&&String(args[1]).startsWith('archive-recovery-v1:')){IDBObjectStore.prototype.put=original;this.transaction.abort();}return request;};
  });
  const result=await save(b,'lastName','UNSAVED');
  assert.equal(result.ok,false);assert.equal(result.code,'LTS_LOCAL_STORAGE');assert.equal(result.recoveryId,undefined);
  assert.deepEqual(await b.evaluate(()=>persisted()),winner);
  assert.equal(await b.evaluate(()=>store.getSyncInfo().pending),true);
  assert.equal((await b.evaluate(()=>store.listRecoveryCopies())).length,0);
  assert.equal((await b.evaluate(()=>outcome(()=>store.leaveAccountView()))).ok,false);
  await t.context.close();
 }
 // Every persisted sync field participates, even when state and revision match.
 {
  const t=await setup(),a=await t.open();await t.context.setOffline(true);
  for(const field of ['baseState','outbox','pending','conflict']){
   await a.evaluate(field=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('lts-registro-iphone-v1',1);req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get('account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
     get.onsuccess=()=>{const r=get.result;if(field==='baseState'){r.baseState.profile.firstName='HIDDEN BASE';}else if(field==='outbox'){r.outbox={state:structuredClone(r.state),baseRevision:r.revision,requestId:crypto.randomUUID()};}else if(field==='pending'){r.pending=true;}else{r.conflict={paths:['profile.firstName']};}store.put(r,r.user.id);};
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
   }),field);
   const winner=await a.evaluate(()=>persisted()),result=await save(a,'lastName','CANDIDATE '+field);
   assert.equal(result.code,'LTS_LOCAL_CONFLICT',field+' must be compared atomically');
   assert.deepEqual(await a.evaluate(()=>persisted()),winner);
  }
  assert.equal((await a.evaluate(()=>store.listRecoveryCopies())).length,4);
  await t.context.close();
 }
 // Logout while a response is in flight retains disk data but cannot reopen UI.
 {
  const t=await setup(),a=await t.open(),gate=t.pause('write');
  const saving=save(a,'firstName','BEFORE LOGOUT');await gate.started.promise;
  const disk=await a.evaluate(()=>persisted());
  await a.evaluate(()=>{auth.signOut();store.lockRevokedAccount();window.publications=0;store.subscribeState(()=>window.publications++);});
  gate.release.resolve();assert.equal((await saving).ok,false);
  assert.deepEqual(await a.evaluate(()=>persisted()),disk);
  assert.deepEqual(await a.evaluate(()=>({verified:auth.isVerified(),using:store.usingAccount(),count:store.getSyncInfo().recoveryCount,published:window.publications})),{verified:false,using:false,count:0,published:0});
  const other=await t.open({id:SECOND,token:OTHER});
  assert.deepEqual(await other.evaluate(()=>store.listRecoveryCopies()),[]);
  assert.equal(await other.evaluate(()=>window.snapshot.state.profile.firstName),'');
  assert.deepEqual(await other.evaluate(()=>persisted()),disk,'Other owner cannot overwrite pending old account');
  await t.context.close();
 }
 console.log('PASS '+engine+' real IndexedDB CAS: offline tabs, suspended GET/POST, recovery merge/export/delete, abort, auth/MFA and logout isolation');
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
