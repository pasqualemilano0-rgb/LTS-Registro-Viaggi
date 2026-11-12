import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {SERVICES,ACTIVE_SERVICES} from '../shared/domain.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const microtask=()=>new Promise(resolve=>setTimeout(resolve,0));
function element(tag='div'){
 const handlers=new Map();
 const e={tagName:tag.toUpperCase(),children:[],textContent:'',className:'',
  dataset:{},value:'',disabled:false,hidden:false,
  append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=[...items]},
  querySelector(selector){return this.children.find(x=>x.tagName===selector.toUpperCase())||null},
  querySelectorAll(selector){
   if(selector==='form[data-service]')return this.children.filter(x=>x.tagName==='FORM'&&x.dataset.service);
   if(selector==='input,button')return this.children.flatMap(x=>x.children.filter(y=>y.tagName==='INPUT'||y.tagName==='BUTTON'));
   return [];
  },
  addEventListener(type,callback){handlers.set(type,callback)},
  dispatch(type){return handlers.get(type)?.({preventDefault(){}})},
  setAttribute(){}
 };
 return e;
}
function fixture(){
 const list=element(),refresh=element('button'),status=element('p'),
   dashboard={hidden:false,dataset:{view:'rates'}};
 const ids={'company-extra-refresh':refresh,'company-extra-list':list,
  'company-extra-status':status,dashboard};
 // Evaluate the UI controller with a synthetic DOM. The production module
 // imports a browser-only absolute path, which Node cannot resolve natively.
 const source=read('amministratore/company-extras.mjs')
  .replace(/^import [^\n]+\n/gm,'')
  .replace('export function setupCompanyExtras','function setupCompanyExtras');
 const document={getElementById:id=>ids[id],createElement:element,activeElement:null};
 const setupCompanyExtras=runInNewContext(source+'\nsetupCompanyExtras',{
  document,
  window:{confirm:()=>true},SERVICES,ACTIVE_SERVICES,
  parseEuro:value=>{
   const raw=String(value).trim().replace(',','.');
   assert.match(raw,/^\d+(?:\.\d{1,2})?$/);
   return Math.round(Number(raw)*100);
  }
 });
 let calls=0;
 const live=SERVICES.map((s,i)=>({serviceKey:s.key,cents:100*(i+1),revision:1}));
 const account={isVerified:()=>true,getRole:()=> 'admin',
  companyTariffs:async(action,data)=>{
   calls++;
   if(action==='list')return {extraRates:live.map(r=>({...r}))};
   if(action==='extra-save'){
    const r=live.find(x=>x.serviceKey===data.serviceKey);
    assert.equal(r.revision,data.expectedRevision);
    r.cents=data.cents;r.revision++;
    return {extra:{...r}};
   }
   throw Error('Unexpected '+action);
  }
 };
 function rowFor(key){return list.children.find(x=>x.dataset.service===key)}
 const api=setupCompanyExtras(account);
 return {api,list,status,live,rowFor,document,getCalls:()=>calls,
  restore:()=>{}};
}
test('saving one extra preserves another unsaved amount instead of erasing it',async()=>{
 const f=fixture();
 try{
  assert.equal(await f.api.load(),true);
  const first=SERVICES[0].key,second=SERVICES[1].key;
  const a=f.rowFor(first),b=f.rowFor(second);
  a.querySelector('input').value='9,99';a.querySelector('input').dispatch('input');
  b.querySelector('input').value='3,50';b.querySelector('input').dispatch('input');
  a.dispatch('submit');
  await microtask();
  assert.equal(f.live[0].cents,999);
  assert.equal(f.rowFor(first).querySelector('input').value,'9,99');
  assert.equal(f.rowFor(second).querySelector('input').value,'3,50');
  assert.equal(f.rowFor(second).querySelector('input').dataset.dirty,'true');
  assert.match(f.status.textContent,/aggiornata per tutti gli autisti/);
  assert.ok(f.list.querySelectorAll('input,button').every(node=>!node.disabled));
 }finally{f.restore()}
});
test('refresh cannot silently replace an extra amount still being typed',async()=>{
 const f=fixture();
 try{
  assert.equal(await f.api.load(),true);
  const input=f.rowFor(ACTIVE_SERVICES[2].key).querySelector('input');
  input.value='72,30';input.dispatch('input');
  const before=f.getCalls();
  assert.equal(await f.api.load(),false);
  assert.equal(f.getCalls(),before);
  assert.equal(f.rowFor(ACTIVE_SERVICES[2].key).querySelector('input').value,'72,30');
  assert.match(f.status.textContent,/importi extra non ancora salvati/);
 }finally{f.restore()}
});
test('driver refresh only displays a success when the catalogue request actually finished',()=>{
 const source=read('app.mjs');
 assert.match(source,/const \[,confirmed\]=await Promise\.all\(\[store\.syncPending\(\),refreshCompanyRates\(\{quiet:false\}\)\]\)/);
 assert.match(source,/if\(!confirmed\)throw new Error\('Sincronizzazione delle tariffe non confermata/);
 assert.match(source,/if\(!confirmed\)throw new Error\('Aggiornamento degli extra non confermato/);
});

test('retired standalone REEFER is absent even while legacy server catalog has eight rows',async()=>{
 const f=fixture();
 assert.equal(await f.api.load(),true);
 assert.equal(f.rowFor('reefer'),undefined);
 assert.ok(f.rowFor('facchinaggioReefer'),'FACCHINAGGIO REEFER must remain available');
 assert.equal(f.list.children.length,7);
});


test('periodic extra refresh updates clean prices and preserves the exact dirty input and caret',async()=>{
 const f=fixture();await f.api.load();
 const first=ACTIVE_SERVICES[0].key,second=ACTIVE_SERVICES[1].key;
 const edited=f.rowFor(first).querySelector('input');
 edited.value='123,45';edited.dispatch('input');
 edited.selectionStart=2;edited.selectionEnd=4;f.document.activeElement=edited;
 f.live.find(row=>row.serviceKey===first).cents=7000;
 f.live.find(row=>row.serviceKey===first).revision++;
 f.live.find(row=>row.serviceKey===second).cents=9900;
 f.live.find(row=>row.serviceKey===second).revision++;
 assert.equal(await f.api.load({silent:true}),true);
 assert.equal(f.rowFor(first).querySelector('input'),edited);
 assert.equal(f.document.activeElement,edited);
 assert.equal(edited.value,'123,45');
 assert.equal(edited.selectionStart,2);assert.equal(edited.selectionEnd,4);
 assert.equal(edited.ltsShownRate.revision,1,'dirty field keeps the revision that authorized its draft');
 assert.equal(f.rowFor(second).querySelector('input').value,'99,00');
 assert.equal(f.rowFor(second).querySelector('input').ltsShownRate.revision,2);
});

test('active rates refresh invokes both editors without navigation or form reset',()=>{
 const source=read('amministratore/report.mjs');
 const first=source.indexOf(' function refreshActive(');
 const last=source.indexOf(' for(const [view,id]',first);
 const calls=[];
 const refresh=runInNewContext(source.slice(first,last)+';refreshActive',{
  account:{isVerified:()=>true,getRole:()=> 'admin'},
  document:{hidden:false},navigator:{onLine:true},
  el:()=>({hidden:false,dataset:{view:'rates'}}),
  companyRates:{load:opts=>calls.push(['rates',opts.silent])},
  companyExtras:{load:opts=>calls.push(['extras',opts.silent])}
 });
 assert.equal(refresh(),true);
 assert.deepEqual(calls,[['rates',true],['extras',true]]);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function accountFixture(){
 const pending=[],calls=[];
 const source=read('account-access.mjs').replace(/^import [^\n]+\n/gm,'').replace(/\bexport /g,'');
 const sessionFor=id=>({user_id:id,role:'admin',access_token:'a'.repeat(100),
  refresh_token:'r'.repeat(100),expires_in:3600,expires_at:Date.now()+3600000});
 const api=runInNewContext(source+`
 api=request;
 session=initial;verified=true;
 ({companyTariffs,driverCompanyCatalog,driverCompanyTariffs,syncDiagnostics,shareCompanyRead,
  changeOwner(next){signOut();session=next;verified=true;},
  invalidateCompanyCatalog});`,{
  initial:sessionFor('3bfc2a56-6f4f-490e-bafe-84a6b11c33e4'),
  request:(endpoint,payload)=>{
   calls.push({endpoint,payload});
   if(['list','refresh'].includes(payload.action)){const task=deferred();pending.push(task);return task.promise;}
   return Promise.resolve({saved:true});
  },runtime:{accountAuth:{}},navigator:{onLine:true},
  sessionStorage:{removeItem(){}},localStorage:{setItem(){}},
  clearDriverToken:async()=>{},readDriverToken:async()=>null,writeDriverToken:async()=>true,setTimeout,clearTimeout,URL
 });
 return {api,pending,calls,sessionFor};
}
const catalog=()=>({tariffs:[{id:'rate',client:'AZIENDA',city:'ROMA',cents:10000}],
 extraRates:ACTIVE_SERVICES.map(service=>({serviceKey:service.key,cents:100,revision:1}))});

test('overlapping authorized catalog readers share one HTTP response and accept seven active extras',async()=>{
 const f=accountFixture();
 const reads=[f.api.companyTariffs('list'),f.api.driverCompanyCatalog(),f.api.driverCompanyTariffs()];
 await microtask();assert.equal(f.calls.length,1);
 f.pending.shift().resolve(catalog());
 const [admin,driver,tariffs]=await Promise.all(reads);
 assert.equal(admin.extraRates.length,7);assert.equal(driver.extraRates.length,7);assert.equal(tariffs.length,1);
 const next=f.api.driverCompanyCatalog();await microtask();assert.equal(f.calls.length,2,'settled reads are never cached');
 f.pending.shift().resolve({...catalog(),extraRates:[...catalog().extraRates,{serviceKey:'reefer',cents:null,revision:1}]});
 assert.equal((await next).extraRates.length,8,'legacy eight-row catalogs remain readable');
});

test('catalog validation rejects duplicate active services and missing active keys',async()=>{
 const f=accountFixture(),first=f.api.driverCompanyCatalog();
 await microtask();const invalid=catalog();invalid.extraRates[1]={...invalid.extraRates[0]};
 f.pending.shift().resolve(invalid);
 await assert.rejects(first,/incompleto/);
});

test('owner changes and mutations invalidate old in-flight reads; writes are never coalesced',async()=>{
 const f=accountFixture(),old=f.api.driverCompanyCatalog();await microtask();
 f.api.changeOwner(f.sessionFor('847a5fd9-d9f8-4ad3-a9ce-ba18920499f0'));
 const current=f.api.driverCompanyCatalog();await microtask();
 assert.equal(f.calls.length,2);
 f.pending.shift().resolve(catalog());await assert.rejects(old,/cambiat/);
 f.pending.shift().resolve(catalog());await current;
 const stale=f.api.driverCompanyCatalog();await microtask();
 await Promise.all([f.api.companyTariffs('extra-save',{serviceKey:'adr',cents:500,expectedRevision:1}),
  f.api.companyTariffs('extra-save',{serviceKey:'pernotto',cents:600,expectedRevision:1})]);
 assert.equal(f.calls.filter(call=>call.payload.action==='extra-save').length,2);
 f.pending.shift().resolve(catalog());await assert.rejects(stale,/cambiati/);
 const fresh=f.api.driverCompanyCatalog();await microtask();f.pending.shift().resolve(catalog());await fresh;
});

test('diagnostics fail clearly when the runtime endpoint is unavailable',async()=>{
 const f=accountFixture();
 await assert.rejects(f.api.syncDiagnostics('report',{pending:0}),/non ancora disponibile/);
 assert.equal(f.calls.length,0);
});

function syntheticClock(){
 let now=0,id=0;const tasks=new Map();
 const clock={get now(){return now},setTimeout(fn,delay){tasks.set(++id,{fn,at:now+delay});return id},clearTimeout(key){tasks.delete(key)},
  async advance(to){
   for(;;){const next=[...tasks].filter(([,task])=>task.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;tasks.delete(next[0]);now=next[1].at;next[1].fn();
    for(let n=0;n<20;n++)await Promise.resolve();
   }
   now=to;for(let n=0;n<20;n++)await Promise.resolve();
  }};
 return clock;
}
function driverCatalogFixture(){
 const clock=syntheticClock(),calls={catalog:0,customers:0},applied={catalog:0,customers:0};
 let owner='account:driver-one';
 const delayed=(key,value)=>{calls[key]++;return new Promise(resolve=>clock.setTimeout(()=>resolve(value),9000));};
 const source=read('app.mjs'),first=source.indexOf('function refreshCompanyRates('),last=source.indexOf('/** Update only the company list',first);
 const api=runInNewContext(`
 let companyRates=[],companyRatesLoaded=false,companyExtraRates=[],companyExtrasLoaded=false,
 companyRatesRequest=0,companyRatesInFlight=null,lastCompanyRatesReadAt=0,
 companyCustomers=[],companyCustomersLoaded=false,companyCustomersError='',
 companyCustomersRequest=0,companyCustomersInFlight=null,lastCompanyCustomersReadAt=0,
 tab='insert',draft={client:'BOZZA',note:'CONSERVA',container:'MSDU3456768'};
 `+source.slice(first,last)+`
 ({rates:refreshCompanyRates,customers:refreshCompanyCustomers,
 snapshot:()=>({companyRates,companyRatesLoaded,companyCustomers,companyCustomersLoaded,draft}),
 reset(){companyRatesRequest++;companyCustomersRequest++;companyRatesInFlight=null;companyCustomersInFlight=null;}});`,{
  Date:{now:()=>clock.now},document:{getElementById:()=>null},
  store:{usingAccount:()=>true},D:{normalizeText:value=>value},
  accountAccess:{isVerified:()=>true,getAccountId:()=>owner,
   driverCompanyCatalog:()=>delayed('catalog',catalog())},
  sharedMapsEnabled:()=>true,sharedMapsCustomers:()=>delayed('customers',[{name:owner,city:'ROMA'}]),
  refreshTripFareEstimate:()=>{applied.catalog++},refreshTripCustomerSuggestions:()=>{applied.customers++}
 });
 return {api,clock,calls,applied,changeOwner:next=>{owner=next;api.reset();}};
}

test('nine-second responses apply during eight-second polling without starving catalogs or drafts',async()=>{
 const f=driverCatalogFixture();
 for(let at=0;at<64000;at+=8000){await f.clock.advance(at);void f.api.rates();void f.api.customers();}
 await f.clock.advance(64000);
 assert.deepEqual(f.calls,{catalog:4,customers:4});
 assert.equal(f.api.snapshot().companyRatesLoaded,true);assert.equal(f.api.snapshot().companyCustomersLoaded,true);
 assert.equal(f.api.snapshot().draft.note,'CONSERVA');
 assert.equal(f.applied.customers,1,'unchanged responses do not rebuild suggestions');
});

test('change hints during an in-flight read schedule one trailing refresh and never apply an old owner',async()=>{
 const f=driverCatalogFixture();void f.api.rates();void f.api.customers();
 for(let n=0;n<5;n++){void f.api.rates({trailing:true});void f.api.customers({trailing:true});}
 await f.clock.advance(18000);
 assert.deepEqual(f.calls,{catalog:2,customers:2});
 void f.api.customers();f.changeOwner('account:driver-two');void f.api.customers();
 await f.clock.advance(27000);
 assert.equal(f.api.snapshot().companyCustomers[0].name,'account:driver-two');
});


test('late 401 and 403 from an old owner never revoke or refresh the new session',async()=>{
 for(const status of [401,403]){
  const f=accountFixture(),old=f.api.driverCompanyCatalog();await microtask();
  const rejected=assert.rejects(old,/Sessione.*cambiat/);
  f.api.changeOwner(f.sessionFor('847a5fd9-d9f8-4ad3-a9ce-ba18920499f0'));
  f.pending.shift().reject(Object.assign(new Error('old denial'),{status}));await rejected;
  const next=f.api.driverCompanyCatalog();await microtask();
  assert.equal(f.calls.length,2,'stale denials must not request token refresh or revoke the new owner');
  f.pending.shift().resolve(catalog());assert.equal((await next).tariffs.length,1);
 }
});

test('driver catalog fallback slows only while realtime is healthy and resumes after health loss',()=>{
 const source=read('app.mjs'),first=source.indexOf('// Update the complete read-only corporate catalog'),
  last=source.indexOf('// Pick up new installed-PWA',first),timers=[];
 let now=0,healthy=true,hidden=false;
 const counts={rates:0,customers:0};
 const api=runInNewContext(`
 let tab='insert',lastCompanyRatesReadAt=0,lastCompanyCustomersReadAt=0;
 function refreshCompanyRates(){lastCompanyRatesReadAt=Date.now();count('rates');}
 function refreshCompanyCustomers(){lastCompanyCustomersReadAt=Date.now();count('customers');}
 `+source.slice(first,last),{
  Date:{now:()=>now},document:{get hidden(){return hidden}},navigator:{onLine:true},
  store:{usingAccount:()=>true},accountAccess:{isVerified:()=>true},window:{addEventListener(){}},
  realtimeHealthy:()=>healthy,count:key=>counts[key]++,setInterval:(fn,ms)=>timers.push({fn,ms})
 });
 for(now=8000;now<=120000;now+=8000)for(const timer of timers)timer.fn();
 assert.deepEqual(counts,{rates:1,customers:1});
 healthy=false;now=128000;for(const timer of timers)timer.fn();
 assert.deepEqual(counts,{rates:2,customers:2},'health loss resumes the eight-second fallback');
 hidden=true;now=136000;for(const timer of timers)timer.fn();
 assert.deepEqual(counts,{rates:2,customers:2},'hidden tabs do not poll');
});

test('shared readonly request identity is scoped by resource and cannot coalesce a write',async()=>{
 const f=accountFixture(),task=deferred();let calls=0;
 const first=f.api.shareCompanyRead('maps:list',()=>{calls++;return task.promise;});
 const second=f.api.shareCompanyRead('maps:list',()=>{calls++;return task.promise;});
 assert.equal(first,second);
 assert.throws(()=>f.api.shareCompanyRead('maps:save',()=>Promise.resolve()),/non valida/);
 await microtask();assert.equal(calls,1);task.resolve({customers:[]});await first;
});

test('shared Maps captures the owner before awaiting a bearer and blocks stale network calls',async()=>{
 const token=deferred();let owner='account:one',epoch=1,fetches=0;
 const source=read('shared-maps-client.mjs').replace(/^import [^\n]+\n/gm,'').replace(/\bexport /g,'');
 const api=runInNewContext(source+';({sharedMapsCustomers});',{
  runtime:{accountAuth:{sharedMapsEndpoint:'https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-shared-maps'}},
  account:{getAccountId:()=>owner,getSessionGeneration:()=>epoch,isVerified:()=>true,
   getVerifiedAccessToken:()=>token.promise,shareCompanyRead:(_key,read)=>read()},
  fetch:()=>{fetches++;throw new Error('Stale owner must not reach the network');},URL,AbortController,setTimeout,clearTimeout
 });
 const pending=api.sharedMapsCustomers();owner='account:two';epoch++;token.resolve('token-for-one');
 await assert.rejects(pending,/Account cambiato/);assert.equal(fetches,0);
});


test('a denied old token refresh cannot revoke a session opened while it was in flight',async()=>{
 const f=accountFixture(),old=f.api.driverCompanyCatalog();await microtask();
 const rejected=assert.rejects(old,/Sessione.*cambiat/);
 f.pending.shift().reject(Object.assign(new Error('expired token'),{status:401}));await microtask();
 assert.equal(f.calls.at(-1).payload.action,'refresh');
 f.api.changeOwner(f.sessionFor('847a5fd9-d9f8-4ad3-a9ce-ba18920499f0'));
 f.pending.shift().reject(Object.assign(new Error('old refresh denied'),{status:403}));await rejected;
 const next=f.api.driverCompanyCatalog();await microtask();
 f.pending.shift().resolve(catalog());assert.equal((await next).tariffs.length,1);
});
