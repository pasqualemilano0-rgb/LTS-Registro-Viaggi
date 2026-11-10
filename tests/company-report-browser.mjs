/** Browser-only isolated QA. No real accounts, production URLs or archive reads. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {extname,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';

const dir=fileURLToPath(new URL('../',import.meta.url));
const runner=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium,webkit}=createRequire(import.meta.url)(runner+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const mockAccount=String.raw`
export const hasSession=()=>true;
export const isVerified=()=>true;
export const getRole=()=> 'admin';
export const getAccountId=()=> 'account:33333333-3333-4333-8333-333333333333';
let mockVerifyMode='ok';
export const mockSetVerifyMode=value=>{mockVerifyMode=value;};
export const verifySession=async()=>{
 if(mockVerifyMode==='offline'){
  const error=new Error('Rete mobile temporaneamente non disponibile.');
  error.offline=true;throw error;
 }
 return {mfa_enrolled:true,mfa_verified:true};
};
export const listAdminMfaFactors=async()=>[{label:'Principale',id:'a'}];
export const manageDrivers=async(action)=>action==='list'?{drivers:[
 {id:'11111111-1111-4111-8111-111111111111',
  firstName:'Mario',lastName:'Rossi',phone:'+393331111111',
  status:'active',enabled:true}
]}:action==='issue'?{code:'A'.repeat(43)}:{};
let mockRates=[{id:'1',client:'CLIENTE ALFA',city:'NAPOLI',cents:15000,revision:1,
 updatedAt:'2026-11-06T12:00:00Z'}];
let mockExtras=['facchinaggioBilico','facchinaggioReefer','reefer','adr',
 'pernotto','sabatoPorto','sabatoTrasferta','preOrario'].map(serviceKey=>({
 serviceKey,cents:serviceKey==='preOrario'?0:null,revision:1,updatedAt:new Date().toISOString()
}));
export const companyTariffs=async(action,data={})=>{
 if(action==='list')return {tariffs:structuredClone(mockRates),extraRates:structuredClone(mockExtras)};
 if(action==='extra-save'){
  const i=mockExtras.findIndex(x=>x.serviceKey===data.serviceKey);
  if(i<0||mockExtras[i].revision!==data.expectedRevision)throw Error('Extra conflict');
  mockExtras[i]={...mockExtras[i],cents:data.cents,revision:mockExtras[i].revision+1};
  return {extra:structuredClone(mockExtras[i])};
 }
 if(action!=='save')throw Error('Unknown tariff action');
 const i=mockRates.findIndex(r=>r.client===data.client&&r.city===data.city);
 if(i>=0){
  if(data.expectedRevision!==mockRates[i].revision)throw Error('Rate conflict');
  mockRates[i]={...mockRates[i],cents:data.cents,revision:mockRates[i].revision+1};
 }else mockRates.push({id:'rate'+mockRates.length,...data,revision:1,updatedAt:new Date().toISOString()});
 return {saved:true};
};

let adminArchiveRevision=3;
let adminAudit=[];
let rejectNextCustomerSave=false;
export const mockRejectNextCustomerSave=()=>{rejectNextCustomerSave=true;};
const removedPersonalRecords=new Map();
let adminArchive={
 schemaVersion:1,profile:{firstName:'Mario',lastName:'Rossi'},
 trips:[{id:'t1',date:'2026-11-04',client:'CLIENTE ALFA',city:'NAPOLI',
  container:'ABCD1234567',secondClient:'',secondCity:'',note:'NOTA INIZIALE',
  services:[],fareCents:15000,secondFareCents:null,sumPickupFares:false,
  extraCents:{adr:null,reefer:null,pernotto:null,preOrario:0,sabatoPorto:null,
   sabatoTrasferta:null,facchinaggioBilico:null,facchinaggioReefer:null},
  createdAt:'2026-11-04T08:00:00Z',updatedAt:'2026-11-04T08:00:00Z'}],
 customers:[{id:'c1',name:'CLIENTE ALFA',city:'NAPOLI',address:'VIA TEST 1, NAPOLI',vat:'',phone:''},
  {id:'c2',name:'CLIENTE AUTISTA',city:'CASERTA',address:'VIA PERSONALE 7',vat:'',phone:''}],
 tariffs:[{id:'r1',customerId:'c2',client:'CLIENTE AUTISTA',city:'CASERTA',cents:6200}],
 extraRates:{adr:null,reefer:null,pernotto:null,preOrario:0,
  sabatoPorto:null,sabatoTrasferta:null,facchinaggioBilico:null,facchinaggioReefer:null}
};
export const adminRecords=async(action,data={})=>{
 if(action==='list')return {drivers:[{id:'11111111-1111-4111-8111-111111111111',
  name:'Mario Rossi',phone:'+393331111111',status:'active',revision:adminArchiveRevision,
  updatedAt:'2026-11-04T08:00:00Z',counts:{trips:1,customers:2,legacyTariffs:1}}]};
 if(action==='read'){await new Promise(resolve=>setTimeout(resolve,90));return {archive:{revision:adminArchiveRevision,
  state:structuredClone(adminArchive),updatedAt:new Date().toISOString()},
  audit:structuredClone(adminAudit)};}
 if(action==='mutate'){
  await new Promise(resolve=>setTimeout(resolve,90));
  if(rejectNextCustomerSave&&data.category==='customer'){
   rejectNextCustomerSave=false;
   throw new Error('Cliente e località tariffa: elemento duplicato.');
  }
  if(data.expectedRevision!==adminArchiveRevision)throw new Error('Revision conflict');
  const rows=adminArchive.trips,idx=rows.findIndex(x=>x.id===data.recordId);
  let affectedTrips=0;
  if(data.operation==='delete'){
   if(data.category!=='customer')throw new Error('Mock delete supports customers only');
   if(!data.reason||String(data.reason).trim().length<8)throw new Error('Audit reason required');
   const toDelete=adminArchive.customers.findIndex(c=>c.id===data.recordId);
   if(toDelete<0)throw new Error('Personal customer missing');
   removedPersonalRecords.set(data.recordId,structuredClone(adminArchive.customers[toDelete]));
   adminArchive.customers.splice(toDelete,1);
  }else if(data.operation==='restore'){
   if(data.category!=='customer'||!data.auditId||
      !removedPersonalRecords.has(data.recordId)||
      adminArchive.customers.some(c=>c.id===data.recordId))
    throw new Error('Restore not authorized or original already exists');
   adminArchive.customers.push(removedPersonalRecords.get(data.recordId));
   removedPersonalRecords.delete(data.recordId);
  }else if(data.operation==='update'&&data.category==='trip'&&idx>=0)
    rows[idx]={...rows[idx],...data.patch,updatedAt:new Date().toISOString()};
   else if(data.operation==='update'&&data.category==='customer'){
    const customerIndex=adminArchive.customers.findIndex(c=>c.id===data.recordId);
    if(customerIndex<0)throw new Error('Personal customer missing');
    const original=adminArchive.customers[customerIndex];
    adminArchive.customers[customerIndex]={
     ...original,...data.patch,updatedAt:new Date().toISOString()
    };
    if(data.patch.name&&data.patch.name!==original.name){
     adminArchive.tariffs=adminArchive.tariffs.map(rate=>
      rate.customerId===data.recordId?{...rate,client:data.patch.name}:rate);
    }
    if(data.updateLinkedTrips===true){
     const norm=x=>String(x||'').trim().toUpperCase();
     const oldName=norm(original.name),oldCity=norm(original.city);
     if(!oldName||!oldCity)throw new Error('Customer identity missing');
     adminArchive.trips=adminArchive.trips.map(trip=>{
      const first=norm(trip.client)===oldName&&norm(trip.city)===oldCity;
      const second=norm(trip.secondClient)===oldName&&norm(trip.secondCity)===oldCity;
      if(first||second)affectedTrips++;
      return first||second?{...trip,
       ...(first?{client:data.patch.name,city:data.patch.city}:{}),
       ...(second?{secondClient:data.patch.name,secondCity:data.patch.city}:{}),
       updatedAt:new Date().toISOString()}:trip;
     });
    }
   }else if(data.operation==='update'&&data.category==='extra')adminArchive.extraRates[data.recordId]=data.patch.cents;
   else throw new Error('Mock action unavailable');
  adminArchiveRevision++;
  adminAudit.unshift({id:'44444444-4444-4444-8444-444444444444',at:new Date().toISOString(),
   category:data.category,action:data.operation,recordId:data.recordId,reason:data.reason||'',
   beforeRevision:adminArchiveRevision-1,afterRevision:adminArchiveRevision});
  return {revision:adminArchiveRevision,state:structuredClone(adminArchive),
   audit:structuredClone(adminAudit),affectedTrips};
 }
 throw new Error('Mock action unavailable');
};
export const pendingAdminMfaInfo=()=>null;
export const forgetPendingAdminMfa=()=>{};
export const logout=async()=>({revoked:true});
export const signOut=()=>{};
export const companyReport=async({month,offset=0,limit=40,driverId=null})=>{
 const drivers=[
 {id:'11111111-1111-4111-8111-111111111111',name:'Mario Rossi',trips:2,days:2,totalCents:25000,missingTariffCount:1,active:true},
 {id:'22222222-2222-4222-8222-222222222222',name:'Lucia Bianchi',trips:0,days:0,totalCents:0,missingTariffCount:0,active:false}
 ];
 const trips=month==='2026-11'?[
 {id:'1',driverId:drivers[0].id,driverName:drivers[0].name,date:'2026-11-04',
  container:'ABCD1234567',client:'CLIENTE ALFA',city:'NAPOLI',secondClient:'',secondCity:'',
  services:['reefer'],note:'<img src=x onerror=alert(1)>',totalCents:15000,
  missingTariff:false,updatedAt:'2026-11-04T08:00:00Z'},
 {id:'2',driverId:drivers[0].id,driverName:drivers[0].name,date:'2026-11-03',
  container:'WXYZ1234567',client:'CLIENTE BETA',city:'SALERNO',secondClient:'ALTRO',secondCity:'NAPOLI',
  services:[],note:'',totalCents:10000,missingTariff:true,updatedAt:'2026-11-03T07:00:00Z'}
 ]:[];
 const selected=driverId?trips.filter(t=>t.driverId===driverId):trips;
 const missing=selected.filter(t=>t.missingTariff).length;
 return {month,reportedAt:new Date().toISOString(),incompleteArchives:0,
  partial:missing>0,source:'Dati di prova sintetici - nessun archivio reale',
  summary:{drivers:new Set(selected.map(t=>t.driverId)).size,trips:selected.length,
   knownTotalCents:selected.reduce((s,t)=>s+t.totalCents,0),missingTariffCount:missing},
  drivers,chart:[...new Set(selected.map(t=>t.date))].sort().map(date=>({
   date,count:selected.filter(t=>t.date===date).length,
   totalCents:selected.filter(t=>t.date===date).reduce((s,t)=>s+t.totalCents,0)})),
  trips:selected.slice(offset,offset+limit),pagination:{offset,limit,total:selected.length}};
};
/* Synthetic V3 analytics – no production data or credentials. */
export const companyInsights=async({month,driverId=null,compareDriverId=null,fromDate=null,toDate=null,
 client='',city='',container=''})=>{
 const all=[
 {id:'1',driverId:'11111111-1111-4111-8111-111111111111',driverName:'Mario Rossi',date:'2026-11-04',
  container:'ABCD1234567',client:'CLIENTE ALFA',city:'NAPOLI',amountCents:15000,missingTariff:false},
 {id:'2',driverId:'11111111-1111-4111-8111-111111111111',driverName:'Mario Rossi',date:'2026-11-03',
  container:'WXYZ1234567',client:'CLIENTE BETA',city:'SALERNO',amountCents:10000,missingTariff:true},
 {id:'3',driverId:'11111111-1111-4111-8111-111111111111',driverName:'Mario Rossi',date:'2026-10-08',
  container:'TEST1234567',client:'CLIENTE ALFA',city:'NAPOLI',amountCents:5000,missingTariff:false}
 ];
 const previous=month==='2026-11'?'2026-10':'2026-09';
 const current=all.filter(x=>x.date.startsWith(month+'-')&&(!driverId||x.driverId===driverId));
 const prev=all.filter(x=>x.date.startsWith(previous+'-')&&(!driverId||x.driverId===driverId));
 const base=all.filter(x=>(!driverId||x.driverId===driverId)&&x.date>=(fromDate||month+'-01')&&
  x.date<=(toDate||month+'-30'));
 const records=base.filter(x=>(!client||x.client.toLowerCase().includes(client.toLowerCase()))&&
  (!city||x.city.toLowerCase().includes(city.toLowerCase()))&&
  (!container||x.container.toLowerCase().includes(container.toLowerCase())));
 const sum=trips=>({trips:trips.length,drivers:new Set(trips.map(x=>x.driverId)).size,
  days:new Set(trips.map(x=>x.date)).size,totalCents:trips.reduce((n,x)=>n+x.amountCents,0),
  missingTariffCount:trips.filter(x=>x.missingTariff).length});
 const months=Array.from({length:12},(_,i)=>{
  const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1-(11-i),1));
  const key=d.toISOString().slice(0,7),items=all.filter(x=>x.date.startsWith(key+'-')&&(!driverId||x.driverId===driverId));
  return {month:key,...sum(items)};
 });
 const rank=(field)=>[...new Set(records.map(x=>x[field]))].map(name=>{
  const items=records.filter(t=>t[field]===name);
  return {name,count:items.length,totalCents:sum(items).totalCents};
 });
 return {
  month,reportedAt:new Date().toISOString(),
  range:{fromDate:fromDate||month+'-01',toDate:toDate||month+'-30'},
  selection:{driverId,compareDriverId,client,city,container},
  summary:{...sum(records),activeDrivers:1},
  currentMonth:sum(current),previousMonth:{month:previous,...sum(prev)},
  monthly:months,compareMonthly:compareDriverId?months.map(x=>({...x,trips:0,totalCents:0})):[],
  drivers:[driverId,compareDriverId].filter(Boolean).map(id=>({id,
   name:id.startsWith('111')?'Mario Rossi':'Lucia Bianchi',
   ...sum(all.filter(x=>x.driverId===id&&x.date.startsWith(month+'-')))})),
  clients:rank('client'),routes:rank('city'),
  options:{clients:['CLIENTE ALFA','CLIENTE BETA'],cities:['NAPOLI','SALERNO']},
  daily:[...new Set(records.map(x=>x.date))].map(date=>({date,trips:records.filter(x=>x.date===date).length})),
  alerts:records.filter(x=>x.missingTariff).map(x=>({type:'tariff',severity:'warning',
   driverId:x.driverId,driverName:x.driverName,date:x.date,detail:'Tariffa incompleta '+x.container})),
  alertTotal:records.filter(x=>x.missingTariff).length,incompleteArchives:0,
  partial:records.some(x=>x.missingTariff),records
 };
};
`;
const mockSharedMaps=String.raw`
let rows=[
 {name:'CLIENTE ALFA',city:'NAPOLI',address:'VIA TEST 1, NAPOLI',
  mapsUrl:'https://maps.app.goo.gl/exampleA',source:'google_maps_link',operationalNotes:''},
 {name:'CLIENTE BETA',city:'SALERNO',address:'VIA TEST 2, SALERNO',
  mapsUrl:'https://maps.app.goo.gl/exampleB',source:'google_maps_link',operationalNotes:''},
 {name:'CLIENTE GAMMA',city:'ROMA',address:'INDIRIZZO STRADALE DA CONFERMARE',
  mapsUrl:'https://maps.app.goo.gl/exampleC',source:'google_maps_link',operationalNotes:''}
];
export const sharedMapsCustomers=async()=>structuredClone(rows);
export const saveSharedMapsCustomer=async(mapsUrl,site)=>{
 const known=rows.find(row=>row.mapsUrl===mapsUrl);
 if(known){
  if(known.address.includes('DA CONFERMARE')&&known.name===site.name&&known.city===site.city){
   known.address=site.address;
   return {customer:structuredClone(known),created:false,updated:true};
  }
  return {customer:structuredClone(known),created:false};
 }
 const created={...site,mapsUrl,source:'google_maps_link',operationalNotes:''};
 rows.push(created);return {customer:structuredClone(created),created:true};
};
export const saveSharedManualCustomer=async site=>{
 const known=rows.find(row=>row.name===site.name&&row.city===site.city);
 if(known)return {customer:structuredClone(known),created:false};
 const created={name:site.name,city:site.city,address:site.address||'',
  mapsUrl:'',source:'manual',operationalNotes:site.notes||''};
 rows.push(created);
 return {customer:structuredClone(created),created:true};
};
`;
const mockMapsReader=String.raw`
export const readMapsCustomer=async(link)=>{
 if(link==='https://maps.app.goo.gl/newDepot')
  return {name:'CLIENTE DELTA',city:'CASERTA',address:'VIA PORTO 8, CASERTA',mapsUrl:link,warnings:[]};
 if(link==='https://maps.app.goo.gl/exampleC')
  return {name:'CLIENTE GAMMA',city:'ROMA',address:'VIA INDUSTRIA 25, ROMA',mapsUrl:link,warnings:[]};
 return {name:'CLIENTE ALFA',city:'NAPOLI',address:'VIA TEST 1, NAPOLI',mapsUrl:link,warnings:[]};
};
`;
const root=resolve(dir),mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/account-access.mjs'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(mockAccount);return;}
 if(path==='/shared-maps-client.mjs'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(mockSharedMaps);return;}
  if(path==='/maps-reader-client.mjs'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(mockMapsReader);return;}
 const file=path==='/amministratore/'?'amministratore/index.html':path.slice(1);
 const target=resolve(root,file);
 if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream'}).end(data);}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const mobileMore=page.locator('#admin-nav-more');
 async function openAdminTab(id){
  if(['records-tab','rates-tab','alerts-tab','exports-tab','security-tab'].includes(id)&&
     !(await mobileMore.evaluate(details=>details.open))){
   await mobileMore.locator('summary').click();
  }
  await page.locator('#'+id).click();
 }
 await page.goto(origin+'/amministratore/',{waitUntil:'networkidle',timeout:20000});
 await page.locator('#dashboard').waitFor({state:'visible'});
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview','Protected overview should open after verified admin MFA');
 assert.equal(await page.locator('#console-overview').isVisible(),true);
 await page.waitForFunction(()=>document.querySelector('#customer-overview-priced').textContent==='1');
 assert.equal(await page.locator('#customer-overview-total').textContent(),'3');

 // Alphabetical roster: existing driver remains accessible by last-name initial.
 await openAdminTab('management-tab');
 await page.locator('#roster-letters button[data-letter="R"]').click();
 assert.match(await page.locator('#roster-count').textContent(),/1 su 1 autisti/);
 assert.match(await page.locator('#roster').textContent(),/Mario Rossi/);
 assert.equal(await page.locator('#roster-letters button[data-letter="R"]').getAttribute('aria-pressed'),'true');
 await page.locator('#roster-letters button[data-letter=""]').click();
 assert.equal(await page.locator('#roster-letters button[data-letter=""]').getAttribute('aria-pressed'),'true');
 // Simulate mobile background/foreground while network validation temporarily fails.
 await page.locator('#search').fill('ROSSI');
 await page.evaluate(async()=>{
  const account=await import('/account-access.mjs?v=20261107-realtime-v1');
  account.mockSetVerifyMode('offline');
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.waitForFunction(()=>{
  const guard=document.querySelector('#admin-resume-guard');
  return !guard.hidden&&guard.dataset.failed==='true';
 });
 assert.equal(await page.locator('#dashboard').evaluate(el=>el.hidden),false);
 assert.equal(await page.locator('#dashboard').evaluate(el=>el.inert),true,
  'Sensitive content stays blocked during connection errors');
 assert.notEqual(await page.locator('#dashboard').evaluate(el=>el.style.visibility),'hidden',
  'No white screen during a resumed admin security check');
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'drivers');
 assert.equal(await page.locator('#search').inputValue(),'ROSSI',
  'The current filter/edit state must survive mobile network loss');
 assert.equal(await page.locator('#admin-resume-guard').isVisible(),true);
 await page.evaluate(async()=>{
  const account=await import('/account-access.mjs?v=20261107-realtime-v1');
  account.mockSetVerifyMode('ok');
 });
 await page.locator('#admin-resume-retry').click();
 await page.waitForFunction(()=>document.querySelector('#admin-resume-guard').hidden);
 assert.equal(await page.locator('#dashboard').evaluate(el=>el.inert),false);
 assert.equal(await page.locator('#search').inputValue(),'ROSSI');
 await page.locator('#search').fill('');
 await openAdminTab('overview-tab');

 // Smart Console: search across authorized data without changing active view.
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 await page.locator('#smart-command-open').click();
 await page.locator('#smart-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview');
 assert.equal(await page.locator('#dashboard').evaluate(node=>node.inert),true);
 await page.locator('#smart-search').fill('ROSSI');
 assert.match(await page.locator('#smart-results').textContent(),/Mario Rossi/i);
 await page.locator('#smart-search').fill('CLIENTE');
 assert.match(await page.locator('#smart-results').textContent(),/CLIENTE/i);
 await page.locator('#smart-search').fill('ABCD');
 assert.match(await page.locator('#smart-results').textContent(),/ABCD1234567/i);
 // V2 contextual read-only previews preserve the active dashboard, search and data.
 await page.locator('#smart-results .smart-result-buttons button').first().click();
 assert.equal(await page.locator('#smart-detail').isVisible(),true);
 assert.match(await page.locator('#smart-detail-body').textContent(),/ABCD1234567/);
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview');
 await page.locator('#smart-back').click();
 assert.equal(await page.locator('#smart-search').inputValue(),'ABCD');
 await page.locator('#smart-search').fill('ROSSI');
 await page.locator('#smart-results .smart-result-buttons button').first().click();
 assert.match(await page.locator('#smart-detail-body').textContent(),/Mario Rossi/);
 assert.match(await page.locator('#smart-detail-actions').textContent(),/Clienti personali/);
 await page.locator('#smart-back').click();
 // Company tariff form stays the original protected form, portalled temporarily.
 await page.locator('#smart-search').fill('GAMMA');
 await page.locator('#smart-results .smart-result-buttons button').first().click();
 assert.match(await page.locator('#smart-detail-body').textContent(),/CLIENTE GAMMA/);
 await page.locator('#smart-detail-actions button').filter({hasText:'Modifica tariffa'}).click();
 await page.locator('#smart-embed-body #company-rates-editor').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#company-rate-client').value==='CLIENTE GAMMA');
 assert.equal(await page.locator('#company-rate-city').inputValue(),'ROMA');
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview');
 assert.equal(await page.locator('#company-rate-submit').isEnabled(),true);
 // Unsaved edits must not disappear through accidental Back, Escape or overlay close.
 await page.locator('#company-rate-amount').fill('90,00');
 let confirmSeen=0;
 page.once('dialog',async dialog=>{confirmSeen++;await dialog.dismiss();});
 await page.locator('#smart-back').click();
 assert.equal(confirmSeen,1);
 assert.equal(await page.locator('#smart-embed-body #company-rates-editor').count(),1);
 assert.equal(await page.locator('#company-rate-amount').inputValue(),'90,00');
 await page.evaluate(()=>window.dispatchEvent(new Event('lts-admin-company-rate-save-started')));
 await page.locator('#smart-back').click();
 assert.equal(await page.locator('#smart-embed-body #company-rates-editor').count(),1,
  'Cannot detach original tariff form while save in progress');
 await page.evaluate(()=>window.dispatchEvent(new Event('lts-admin-company-rate-save-completed')));
 page.once('dialog',async dialog=>{confirmSeen++;await dialog.accept();});
 await page.locator('#smart-back').click();
 assert.equal(confirmSeen,2);
 assert.equal(await page.locator('#smart-embed-body #company-rates-editor').count(),0);
 assert.equal(await page.locator('#company-rates #company-rates-editor').count(),1);
 // Inline original authenticated forms, with no duplicate event listeners.
 await page.locator('[data-smart-action="invite"]').click();
 assert.equal(await page.locator('#smart-embed-body #invite-form').count(),1);
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview');
 await page.locator('#invite-first').fill('TEST');
 await page.locator('#invite-phone').fill('3338887777');
 await page.locator('#smart-back').click();
 assert.equal(await page.locator('#smart-embed-body #invite-form').count(),0);
 assert.equal(await page.locator('#management-panel #invite-form').count(),1);
 assert.equal(await page.locator('#invite-first').inputValue(),'TEST');
 // The original guarded invite form must actually submit from the drawer.
 await page.locator('[data-smart-action="invite"]').click();
 await page.locator('#invite-last').fill('SMART');
 await page.locator('#invite-form button[type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('#secret-panel').hidden);
 assert.equal((await page.locator('#secret-code').inputValue()).length,43);
 await page.locator('#smart-back').click();
 assert.equal(await page.locator('#secret-code').inputValue(),'');
 assert.equal(await page.locator('#invite-first').inputValue(),'');
 await page.locator('[data-smart-action="restore"]').click();
 assert.equal(await page.locator('#smart-embed-body #restore-form').count(),1);
 await page.locator('#smart-close').click();
 assert.equal(await page.locator('#smart-overlay').isVisible(),false);
 assert.equal(await page.locator('#dashboard').evaluate(node=>node.inert),false);
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'overview');
 assert.equal(await page.locator('#management-panel #restore-form').count(),1);
 await page.locator('#invite-form').evaluate(form=>form.reset());

 assert.equal(await page.locator('#customer-overview-unpriced').textContent(),'2');
 assert.match(await page.locator('#customer-overview-sync-status').textContent(),/1 sedi con tariffa, 2 senza tariffa/);
 // An unpriced shared depot pre-fills precisely its name and city.
 await page.locator('#customer-overview-list .customer-directory-set-rate').first().click();
 await page.waitForFunction(()=>document.querySelector('#dashboard').dataset.view==='rates');
 assert.equal(await page.locator('#company-rate-client').inputValue(),'CLIENTE GAMMA');
 assert.equal(await page.locator('#company-rate-city').inputValue(),'ROMA');
 await page.waitForFunction(()=>document.querySelector('#company-sites-count').textContent.includes('2 ancora da tariffare'));
 await page.locator('#overview-tab').click();
 await page.waitForFunction(()=>document.querySelector('#customer-overview-priced').textContent==='1');
 assert.equal(await page.locator('#report-panel').isVisible(),true);
 assert.equal(await page.locator('#management-panel').isVisible(),false);
 const navigation=page.locator('#dashboard>.admin-switch');
 assert.equal(await navigation.locator('button:visible').count(),4,
  'Mobile nav exposes four primary actions; secondary sections live in More');
 assert.equal(await mobileMore.locator('summary').isVisible(),true);
 assert.equal(await mobileMore.evaluate(details=>details.open),false,'More starts collapsed on mobile');
 const mobileGeometry=await navigation.evaluate(element=>({
  width:element.getBoundingClientRect().width,viewport:innerWidth,
  documentScroll:document.documentElement.scrollWidth
 }));
 assert(mobileGeometry.width<=mobileGeometry.viewport+1&&
  mobileGeometry.documentScroll<=mobileGeometry.viewport+1,'Mobile navigation must fit the viewport');
 // Verify the compact tab bar and full-width layout on narrow and tablet viewports.
 for(const width of [320,360,768]){
  await page.setViewportSize({width,height:844});
  const box=await navigation.evaluate(nav=>{
   const buttons=[...nav.querySelectorAll(':scope > button')];
   const rects=buttons.map(button=>button.getBoundingClientRect());
   const navBox=nav.getBoundingClientRect();
   return {
    viewport:innerWidth,
    documentScroll:document.documentElement.scrollWidth,
    navLeft:navBox.left,navRight:navBox.right,
    colCount:getComputedStyle(nav).gridTemplateColumns.split(' ').length,
    buttonWidths:rects.map(rect=>rect.width),
    buttonHeights:rects.map(rect=>rect.height),
    labelSize:parseFloat(getComputedStyle(buttons[0]).fontSize)
   };
  });
  assert.equal(box.colCount,5,width+'px: four tabs and More fit one row');
  assert(box.navLeft>=-1&&box.navRight<=box.viewport+1,
   width+'px: bar fits the viewport');
  assert(box.documentScroll<=box.viewport+2,width+'px: no horizontal page overflow');
  assert(box.buttonWidths.every(n=>n>=42)&&box.buttonHeights.every(n=>n>=44),
   width+'px: readable tap target geometry');
  assert(box.labelSize>=11,width+'px: mobile nav labels remain readable');
 }
 await page.setViewportSize({width:390,height:844});


 await openAdminTab('analysis-tab');
 await page.locator('#report-count').waitFor();
 await page.locator('#report-month').fill('2026-11');
 await page.locator('#report-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.match((await page.locator('#report-total').textContent()).replace(/\s/g,' '),/250,00/);
 assert.equal(await page.locator('#report-missing').textContent(),'1');
 assert.equal(await page.locator('#report-rows tr').count(),2);
 assert.equal(await page.locator('#report-chart .report-bar-row').count(),2);
 assert.equal(await page.locator('#report-driver-chart .report-bar-row').count(),1);
 // V3: automatically loaded 12-month insights, client/route rankings and anomaly center.
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='2 viaggi');
 assert.equal(await page.locator('#pro-trend-months button').count(),12);
 assert.equal(await page.locator('#pro-clients button').count(),2);
 assert.equal(await page.locator('#pro-routes button').count(),2);
 assert.equal(await page.locator('#pro-alert-count').textContent(),'1');
 assert.equal(await page.locator('#pro-export-pdf').isEnabled(),true);
 assert.match(await page.locator('#pro-delta-trips').textContent(),/100%/);
 // Interactive customer filtering, date interval, and PDF/Excel outputs.
 await page.locator('#pro-clients button').first().click();
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='1 viaggi');
 assert.equal(await page.locator('#pro-records .pro-record').count(),1);
 await page.locator('#pro-clear').click();
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='2 viaggi');
 await page.locator('#pro-from').fill('2026-11-04');
 await page.locator('#pro-to').fill('2026-11-04');
 await page.locator('#pro-apply').click();
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='1 viaggi');
 await page.locator('#pro-clear').click();
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='2 viaggi');
 // Dedicated anomalies page opens the exact affected day.
 await openAdminTab('alerts-tab');
 assert.equal(await page.locator('.pro-alerts-panel').isVisible(),true);
 assert.equal(await page.locator('.pro-trend-panel').isVisible(),false);
 await page.locator('#pro-alerts [data-selectable="true"]').first().click();
 await page.waitForFunction(()=>document.querySelector('#report-driver').value==='11111111-1111-4111-8111-111111111111'&&
  document.querySelector('#pro-from').value==='2026-11-03'&&
  document.querySelector('#pro-record-count').textContent==='1 viaggi');
 assert.equal(await page.locator('#pro-to').inputValue(),'2026-11-03');
 await openAdminTab('analysis-tab');
 await page.locator('#report-show-all').click();
 await page.waitForFunction(()=>document.querySelector('#report-driver').value===''&&
  document.querySelector('#pro-record-count').textContent==='2 viaggi');
 await openAdminTab('exports-tab');
 assert.equal(await page.locator('.pro-exports').isVisible(),true);
 assert.equal(await page.locator('.report-graphs').isVisible(),false);
 const pd=page.waitForEvent('download');
 await page.locator('#pro-export-pdf').click();
 const pdf=await pd;
 assert.match(pdf.suggestedFilename(),/\.pdf$/);
 const pdfBytes=await readFile(await pdf.path());
 assert(pdfBytes.subarray(0,8).toString('ascii').startsWith('%PDF-1.4'));
 const xd=page.waitForEvent('download');
 await page.locator('#pro-export-xlsx').click();
 const xlsx=await xd;
 assert.match(xlsx.suggestedFilename(),/\.xlsx$/);
 const xlsxBytes=await readFile(await xlsx.path());
 assert.equal(xlsxBytes[0],80);assert.equal(xlsxBytes[1],75);
 await openAdminTab('analysis-tab');
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),2);
 assert.equal(await page.locator('#report-driver-cards .report-person-card').count(),2);
 assert.equal(await page.locator('#report-driver-profile').isVisible(),false);
 // Find and open an individual driver from the searchable directory.
 await page.locator('#report-driver-search').fill('Mario');
 assert.equal(await page.locator('#report-driver-cards .report-person-card').count(),1);
 await page.locator('#report-driver-cards .report-person-card').first().click();
 await page.waitForFunction(()=>document.querySelector('#report-profile-title').textContent==='Mario Rossi'&&
  document.querySelector('#report-driver-profile').hidden===false);
 assert.equal(await page.locator('#report-profile-trips').textContent(),'2');
 await page.waitForFunction(()=>document.querySelector('#pro-record-count').textContent==='2 viaggi');
 await page.locator('#pro-compare-driver').selectOption('22222222-2222-4222-8222-222222222222');
 await page.waitForFunction(()=>document.querySelector('#pro-compare-output table tbody tr')!==null);
 assert.equal(await page.locator('#pro-compare-output tbody tr').count(),2);
 assert.match(await page.locator('#pro-compare-output').textContent(),/Lucia Bianchi/);
 assert.equal(await page.locator('#report-profile-days').textContent(),'2');
 assert.match((await page.locator('#report-profile-average').textContent()).replace(/\s/g,' '),/125,00/);
 assert.match((await page.locator('#report-profile-total').textContent()).replace(/\s/g,' '),/250,00/);
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),2);
 assert.equal(await page.locator('#report-rows tr').count(),2);
 assert.equal(await page.locator('#report-driver-cards .report-person-card').count(),1,'Search stays active');
 assert.equal(await page.locator('#report-driver-cards .report-person-card').first().getAttribute('aria-pressed'),'true');
 await page.locator('#report-driver-search').fill('');
 await page.locator('#report-driver').selectOption('22222222-2222-4222-8222-222222222222');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='0');
 assert.equal(await page.locator('#report-driver-chart .report-bar-row').count(),0);
 assert.equal(await page.locator('#report-profile-title').textContent(),'Lucia Bianchi');
 assert.equal(await page.locator('#report-profile-trips').textContent(),'0');
 assert.equal(await page.locator('#report-profile-days').textContent(),'0');
 assert.equal(await page.locator('#report-profile-average').textContent(),'—');
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),0);
 await page.locator('#report-show-all').click();
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.equal(await page.locator('#report-driver-profile').isVisible(),false);
 await page.locator('#report-driver').selectOption('');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.equal(await page.locator('#report-driver-chart .report-bar-row').count(),1);
 await openAdminTab('report-tab');
 assert.equal(await page.locator('.report-register').isVisible(),true);
 await page.locator('#report-rows details').first().locator('summary').click();
 assert.match(await page.locator('#report-rows details').first().textContent(),/Seconda presa/);
 assert.equal(await page.locator('img[src="x"]').count(),0,'Notes must not create HTML');
 await page.locator('#report-month').fill('2026-10');
 await page.locator('#report-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='0');
 assert.equal(await page.locator('#report-rows tr').count(),0);
 assert.equal(await page.locator('#report-chart .report-bar-row').count(),0);
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),0);
 // Month reset returns to the current month and clears the driver selection.
 await page.locator('#report-reset-filters').click();
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.equal(await page.locator('#report-driver').inputValue(),'');
 await page.locator('#report-month').fill('2026-11');
 await page.locator('#report-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 await openAdminTab('management-tab');
 assert.equal(await page.locator('#report-panel').isVisible(),false);
 await openAdminTab('report-tab');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 // All eight navigation pages are real, separate, keyboard-accessible views.
 const sectionCases=[
  ['overview-tab','overview','#console-overview'],
  ['management-tab','drivers','#invite-form'],
  ['report-tab','trips','.report-register'],
  ['records-tab','records','#admin-records-panel'],
  ['analysis-tab','analysis','.report-graphs'],
  ['alerts-tab','alerts','.pro-alerts-panel'],
  ['exports-tab','exports','.pro-exports'],
  ['security-tab','security','#security-console']
 ];
 for(const [button,view,content] of sectionCases){
  await openAdminTab(button);
  assert.equal(await page.locator('#dashboard').getAttribute('data-view'),view,'Tab '+view+' must be functional');
  assert.equal(await page.locator('#'+button).getAttribute('aria-current'),'page');
  if(['records-tab','alerts-tab','exports-tab','security-tab'].includes(button)){
   assert.equal(await mobileMore.evaluate(details=>details.open),false,
    'More closes after choosing a secondary section');
   assert.equal(await mobileMore.locator('summary').getAttribute('aria-current'),'page',
    'More announces its selected section');
  }
  assert.equal(await page.locator(content).isVisible(),true,'Section '+view+' must show actual controls');
 }
 // Add a manually registered company customer before editing an autista's trip.
 await openAdminTab('rates-tab');
 await page.waitForFunction(()=>document.querySelector('#company-rates-count').textContent.includes('1 tariffe aziendali'));
 await page.locator('#company-rate-client').fill('CLIENTE MANUALE');
 await page.locator('#company-rate-city').fill('AVELLINO');
 await page.locator('#company-rate-amount').fill('76,00');
 await page.locator('#company-rate-submit').click();
 await page.waitForFunction(()=>document.querySelector('#company-rates-count').textContent.includes('2 tariffe aziendali'));
  // A custom customer with no fare or Maps link must be shared too.
  await page.locator('#company-manual-name').fill('CLIENTE SOLO MANUALE');
  await page.locator('#company-manual-city').fill('BARI');
  await page.locator('#company-manual-notes').fill('Ingresso deposito da verificare');
  await page.locator('#company-manual-save').click();
  await page.waitForFunction(()=>document.querySelector('#company-manual-status').textContent.includes('Cliente manuale aggiunto'));
  await page.locator('#company-manual-name').fill('CLIENTE SOLO MANUALE');
  await page.locator('#company-manual-city').fill('BARI');
  await page.locator('#company-manual-save').click();
  await page.waitForFunction(()=>document.querySelector('#company-manual-status').textContent.includes('nessun duplicato'));

 // Synthetic end-to-end test of driver record editing and audit.
 await openAdminTab('records-tab');
 await page.waitForFunction(()=>document.querySelector('#records-trips').textContent==='1');
 assert.equal(await page.locator('#records-customers').textContent(),'2');
 assert.match(await page.locator('#records-list').textContent(),/NOTA INIZIALE/);
 await page.locator('#records-list .records-card-actions button').first().click();
 // Two overlapping owner reads must not freeze the refresh button.
 await page.locator('#records-driver').dispatchEvent('change');
 await page.locator('#records-driver').dispatchEvent('change');
 await page.waitForFunction(()=>!document.querySelector('#records-refresh').disabled);
 assert.equal(await page.locator('#records-revision').textContent(),'3');
 await page.locator('#records-list .records-card-actions button').first().click();
 // Shared company list is the default, with an explicit personal-customer switch.
 const primarySite=page.locator('#records-editor .records-site-picker').first();
 assert.equal(await primarySite.locator('select').count(),0);
 await page.waitForFunction(()=>!document.querySelector('.records-site-picker input[type=search]').disabled);
 const scopes=primarySite.locator('.records-site-scope');
 assert.equal(await scopes.filter({hasText:'Condivisi'}).getAttribute('aria-pressed'),'true');
 await primarySite.locator('input[type="search"]').fill('CLIENTE');
 assert.equal(await primarySite.locator('.records-site-option-source').filter({hasText:'Cliente autista'}).count(),0);
 // Every row must have its natural height on a mobile viewport; no overlapping labels.
 const placements=await primarySite.locator('.records-site-option').evaluateAll(elements=>
  elements.map(element=>{const box=element.getBoundingClientRect();return {top:box.top,bottom:box.bottom};}));
 for(let idx=1;idx<placements.length;idx++)
  assert.ok(placements[idx].top>=placements[idx-1].bottom-1,'Shared customer choices may not overlap');
 await scopes.filter({hasText:'Personali autista'}).click();
 await primarySite.locator('input[type="search"]').fill('CLIENTE AUTISTA');
 await primarySite.locator('.records-site-option').filter({hasText:'CLIENTE AUTISTA'}).click();
 assert.equal(await page.locator('#records-editor input[name="client"]').inputValue(),'CLIENTE AUTISTA');
 assert.equal(await page.locator('#records-editor input[name="city"]').inputValue(),'CASERTA');
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'150,00',
  'Changing an existing trip customer must not erase its previous fare');
 await scopes.filter({hasText:'Condivisi'}).click();
 await primarySite.locator('input[type="search"]').fill('CLIENTE MANUALE');
 await primarySite.locator('.records-site-option').filter({hasText:'CLIENTE MANUALE'}).click();
 assert.equal(await page.locator('#records-editor input[name="client"]').inputValue(),'CLIENTE MANUALE');
 assert.equal(await page.locator('#records-editor input[name="city"]').inputValue(),'AVELLINO');
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'150,00');
 await primarySite.locator('.records-site-apply-fare').click();
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'76,00',
  'A new company rate is only applied after an explicit action');
 await primarySite.locator('input[type="search"]').fill('CLIENTE BETA');
 await primarySite.locator('.records-site-option').filter({hasText:'CLIENTE BETA'}).click();
 assert.equal(await page.locator('#records-editor input[name="client"]').inputValue(),'CLIENTE BETA');
 assert.equal(await page.locator('#records-editor input[name="city"]').inputValue(),'SALERNO');
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'76,00');
 await primarySite.locator('input[type="search"]').fill('CLIENTE ALFA');
 await primarySite.locator('.records-site-option').filter({hasText:'CLIENTE ALFA'}).click();
 assert.equal(await page.locator('#records-editor input[name="client"]').inputValue(),'CLIENTE ALFA');
 assert.equal(await page.locator('#records-editor input[name="city"]').inputValue(),'NAPOLI');
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'76,00');
 await primarySite.locator('.records-site-apply-fare').click();
 assert.equal(await page.locator('#records-editor input[name="fareCents"]').inputValue(),'150,00');
 await page.locator('#records-editor textarea[name="note"]').fill('BOZZA NON SALVATA');
 await page.locator('#records-search').fill('NESSUN RISULTATO');
 assert.equal(await page.locator('#records-editor textarea[name="note"]').inputValue(),'BOZZA NON SALVATA',
  'Search must not destroy an unsaved editor');
 await page.locator('#records-search').fill('');
 page.once('dialog',dialog=>dialog.dismiss());
 await openAdminTab('management-tab');
 assert.equal(await page.locator('#dashboard').getAttribute('data-view'),'records');
 assert.equal(await page.locator('#records-editor textarea[name="note"]').inputValue(),'BOZZA NON SALVATA');
 await page.locator('#records-editor textarea[name="note"]').fill('NOTA CORRETTA DA ADMIN');
 await page.locator('#records-editor button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#records-driver').disabled);
 assert.equal(await page.locator('#records-driver').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('#records-revision').textContent==='4');
 assert.match(await page.locator('#records-list').textContent(),/NOTA CORRETTA DA ADMIN/);
 await page.locator('#records-tabs button[data-kind="history"]').click();
 assert.match(await page.locator('#records-list').textContent(),/UPDATE/);
 // Edit a driver's personal customer using the direct roster link.
 await openAdminTab('management-tab');
 await page.locator('#roster .driver-actions button').filter({hasText:'Clienti personali'}).first().click();
 await page.waitForFunction(()=>document.querySelector('#dashboard').dataset.view==='records');
 assert.equal(await page.locator('#records-tabs button[data-kind="customer"]').getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>document.querySelector('#records-list').textContent.includes('CLIENTE AUTISTA'));
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE AUTISTA/);
 await page.locator('#records-list .records-card')
  .filter({hasText:'CLIENTE AUTISTA'}).locator('button[aria-label^="Modifica"]').click();
 assert.match(await page.locator('#records-editor .records-private-note').textContent(),
  /Cliente personale di Mario Rossi/);
 // The administrator can replace a personal customer with a verified shared entry.
 const corporatePicker=page.locator('#records-editor .records-company-picker');
 await page.waitForFunction(()=>!document.querySelector('.records-company-picker input[type=search]')?.disabled);
 assert.equal(await corporatePicker.locator('select').count(),0);
 await corporatePicker.locator('input[type=search]').fill('CLIENTE AUTISTA');
 assert.equal(await corporatePicker.locator('.records-site-option').count(),0,
  'Personal customers must not appear in the company directory picker');
 await corporatePicker.locator('input[type=search]').fill('CLIENTE ALFA');
 await corporatePicker.locator('.records-site-option').filter({hasText:'CLIENTE ALFA'}).click();
 assert.match(await corporatePicker.locator('.records-site-hint').textContent(),/altro cliente personale/i);
 assert.equal(await page.locator('#records-editor input[name=name]').inputValue(),'CLIENTE AUTISTA',
  'A conflicting existing personal name must never replace the current record');
 await page.locator('#records-editor input[name=phone]').fill('+390811112222');
 await page.locator('#records-editor input[name=vat]').fill('IT12345678901');
 await corporatePicker.locator('input[type=search]').fill('CLIENTE BETA');
 await corporatePicker.locator('.records-site-option').filter({hasText:'CLIENTE BETA'}).click();
 assert.equal(await page.locator('#records-editor input[name=name]').inputValue(),'CLIENTE BETA');
 assert.equal(await page.locator('#records-editor input[name=city]').inputValue(),'SALERNO');
 assert.equal(await page.locator('#records-editor input[name=address]').inputValue(),'VIA TEST 2, SALERNO');
 assert.equal(await page.locator('#records-editor input[name=phone]').inputValue(),'');
 assert.equal(await page.locator('#records-editor input[name=vat]').inputValue(),'');
 assert.match(await corporatePicker.locator('.records-site-chosen').textContent(),/NON ANCORA SALVATA/);
 const acknowledgement=page.locator('#records-editor .records-private-rate-ack');
 assert.equal(await acknowledgement.isVisible(),true);
 assert.equal(await acknowledgement.locator('input').isChecked(),false,
  'A different company selection must require a fresh tariff acknowledgement');
 const checkboxSize=await acknowledgement.locator('input').evaluate(el=>{
  const box=el.getBoundingClientRect();
  return {width:box.width,height:box.height};
 });
 assert.ok(checkboxSize.width<=24&&checkboxSize.height<=24,
  'Linked tariff confirmation must remain a compact checkbox on mobile');
 await corporatePicker.locator('.records-company-jump').click();
 assert.equal(await page.locator('#records-editor input[name=reason]').evaluate(
  el=>document.activeElement===el),true,'Shortcut must lead to the audit and save controls');
 await corporatePicker.locator('input[type=search]').fill('CLIENTE SOLO MANUALE');
 await corporatePicker.locator('.records-site-option').filter({hasText:'CLIENTE SOLO MANUALE'}).click();
 assert.equal(await page.locator('#records-editor input[name=name]').inputValue(),'CLIENTE SOLO MANUALE');
 assert.equal(await page.locator('#records-editor input[name=city]').inputValue(),'BARI');
 assert.equal(await page.locator('#records-editor input[name=address]').inputValue(),'',
  'A company entry without an address must not inherit the old personal address');
 // The company can be selected first; the final acknowledgement is made next to the save button.
 assert.equal(await acknowledgement.locator('input').isChecked(),false,
  'Picking a second site resets the linked-tariff consent');
 // The existing audited manual editing flow must remain available.
 await page.locator('#records-editor input[name=city]').fill('CASERTA');
 await page.locator('#records-editor input[name="name"]').fill('CLIENTE AUTISTA CORRETTO');
 await page.locator('#records-editor input[name="address"]').fill('VIA PERSONALE 99');
 await page.locator('#records-editor input[name="phone"]').fill('+390811234567');
 await page.locator('#records-editor input[name="reason"]').fill('Correzione anagrafica cliente personale');
 await page.locator('#records-editor button[type="submit"]').click();
 assert.equal(await page.locator('#records-revision').textContent(),'4',
  'Saving a selected company customer without confirming linked tariffs must be blocked');
 assert.equal(await page.locator('#records-editor .records-save-feedback').isVisible(),true,
  'Blocked save must show a message NEXT TO the save button, not only at the archive header');
 assert.match(await page.locator('#records-editor .records-save-feedback').textContent(),/verifica/i);
 await acknowledgement.locator('input').check();
 // Simulate production HTTP 400: error must be visible beside save, and
 // the user's edited form must remain intact for a second attempt.
 await page.evaluate(async()=>{
  const account=await import('/account-access.mjs?v=20261107-realtime-v1');
  account.mockRejectNextCustomerSave();
 });
 await page.locator('#records-editor button[type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('#records-editor .records-save-feedback')?.hidden);
 assert.match(await page.locator('#records-editor .records-save-feedback').textContent(),/tariffa.*duplicato/i);
 assert.equal(await page.locator('#records-revision').textContent(),'4');
 assert.equal(await page.locator('#records-editor input[name=name]').inputValue(),'CLIENTE AUTISTA CORRETTO');
 await page.locator('#records-editor button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#records-revision').textContent==='5');
 await page.waitForFunction(()=>document.querySelector('.records-save-toast')?.textContent.includes('Modifica salvata online'));
 assert.equal(await page.locator('.records-save-toast').isVisible(),true,
  'Saved update must confirm success without making the admin scroll to the top');
 await page.waitForFunction(()=>document.querySelector('#records-list').textContent.includes('CLIENTE AUTISTA CORRETTO'));
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE AUTISTA CORRETTO/);
 assert.match(await page.locator('#records-list').textContent(),/VIA PERSONALE 99/);
 assert.equal(await page.locator('#records-customers').textContent(),'2');
 // Home shortcut opens the same category without sharing a private record.
 await openAdminTab('overview-tab');
 await page.locator('[data-open-private-customers]').click();
 await page.waitForFunction(()=>document.querySelector('#dashboard').dataset.view==='records');
 assert.equal(await page.locator('#records-tabs button[data-kind="customer"]').getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>document.querySelector('#records-list').textContent.includes('CLIENTE AUTISTA CORRETTO'));
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE AUTISTA CORRETTO/);
 // The mobile delete control must open an in-card audited confirmation.
 await page.waitForFunction(()=>document.querySelector('#records-shared-status').textContent.includes('verificato'));
 const personalCard=page.locator('#records-list .records-card').filter({hasText:'CLIENTE AUTISTA CORRETTO'});
 await personalCard.locator('button.records-danger').click();
 assert.equal(await personalCard.locator('.records-delete-confirm').isVisible(),true);
 await personalCard.locator('.records-delete-actions button').filter({hasText:'Annulla'}).click();
 assert.equal(await personalCard.locator('.records-delete-confirm').count(),0);
 assert.equal(await page.locator('#records-customers').textContent(),'2',
  'Cancelling deletion must leave all personal records unchanged');
 // A matching Google Maps destination must be verified before removing only the personal duplicate.
 const duplicate=page.locator('#records-list .records-card').filter({hasText:'CLIENTE ALFA'});
 await duplicate.locator('button.records-card-certify').click();
 await page.locator('#records-editor .records-certify-label input[type=url]').fill('https://maps.app.goo.gl/exampleA');
 await page.locator('#records-editor .records-certify-read').click();
 await page.waitForFunction(()=>document.querySelector('.records-certify-preview')?.hidden===false);
 assert.match(await page.locator('.records-certify-result').textContent(),/già nella lista condivisa/i);
 assert.equal(await page.locator('#records-customers').textContent(),'2',
  'Maps verification alone must never delete a customer');
 await page.locator('.records-certify-choice input[type=checkbox]').check();
 await page.locator('.records-certify-submit').click();
 await page.waitForFunction(()=>document.querySelector('#records-customers').textContent==='1');
 assert.equal(await page.locator('#records-list').textContent().then(x=>x.includes('CLIENTE ALFA')),false,
  'Only the reviewed personal duplicate should disappear');
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE AUTISTA CORRETTO/);
 await page.locator('#records-tabs button[data-kind="history"]').click();
 assert.match(await page.locator('#records-list').textContent(),/DELETE/);
 // Restore the exact deleted private row without touching the historical trip.
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#records-list .records-card').filter({hasText:'DELETE'})
  .first().locator('button').filter({hasText:'Ripristina'}).click();
 await page.waitForFunction(()=>document.querySelector('#records-revision').textContent==='7');
 assert.equal(await page.locator('#records-customers').textContent(),'2');
 assert.equal(await page.locator('#records-trips').textContent(),'1');
 assert.match(await page.locator('#records-list').textContent(),/RESTORE/);
 const restoredDeletion=page.locator('#records-list .records-card').filter({hasText:'DELETE'}).first();
 assert.match(await restoredDeletion.textContent(),/Già ripristinato/);
 assert.equal(await restoredDeletion.locator('button').filter({hasText:'Ripristina'}).count(),0,
  'An audit deletion must not offer Restore after a completed restoration');
 await page.locator('#records-tabs button[data-kind="customer"]').click();
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE ALFA/);
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE AUTISTA CORRETTO/);
 // Updating a personal customer must NEVER mutate journeys by default.
 // Explicit opt-in synchronizes exactly matching historical customer locations.
 const oldRevision=Number(await page.locator('#records-revision').textContent());
 await page.locator('#records-list .records-card').filter({hasText:'CLIENTE ALFA'})
  .locator('button[aria-label^="Modifica"]').click();
 const corporate=page.locator('#records-editor .records-company-picker');
 await page.waitForFunction(()=>!document.querySelector('.records-company-picker input[type=search]')?.disabled);
 await corporate.locator('input[type=search]').fill('CLIENTE BETA');
 await corporate.locator('.records-site-option').filter({hasText:'CLIENTE BETA'}).click();
 const tripAck=page.locator('#records-editor .records-private-trip-sync');
 assert.equal(await tripAck.isVisible(),true);
 assert.match(await tripAck.textContent(),/1 viaggi già registrati/);
 assert.equal(await tripAck.locator('input[type=checkbox]').isChecked(),false,
  'Updating historical trips must be opt-in, never implicit');
 await tripAck.locator('input[type=checkbox]').check();
 await page.locator('#records-editor input[name=reason]').fill('Cambio cliente e aggiornamento viaggio autorizzato');
 await page.locator('#records-editor button[type=submit]').click();
 await page.waitForFunction(n=>Number(document.querySelector('#records-revision').textContent)>n,oldRevision);
 assert.match(await page.locator('#records-status').textContent(),/1 viaggi collegati aggiornati/);
 await page.locator('#records-tabs button[data-kind="trip"]').click();
 assert.match(await page.locator('#records-list').textContent(),/CLIENTE BETA/);
 assert.match(await page.locator('#records-list').textContent(),/150,00/,
  'Historic trip price must remain unchanged after customer replacement');
 // One shared company extra price: no individual driver selector.
 await openAdminTab('rates-tab');
 await page.waitForFunction(()=>document.querySelectorAll('.company-extra-row').length===8);
 assert.equal(await page.locator('#company-extra-driver').count(),0);
 await page.locator('.company-extra-row[data-service="adr"] input').fill('12,50');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.company-extra-row[data-service="adr"] button').click();
 await page.waitForFunction(()=>document.querySelector('#company-extra-status').textContent.includes('tutti gli autisti'));
 assert.equal(await page.locator('.company-extra-row[data-service="adr"] input').inputValue(),'12,50');
 // New Google Maps customer and corporate rate, without creating a personal customer.
 await page.locator('#company-maps-url').fill('https://maps.app.goo.gl/newDepot');
 await page.locator('#company-maps-read').click();
 await page.waitForFunction(()=>!document.querySelector('#company-maps-preview').hidden);
 assert.equal(await page.locator('#company-maps-name').textContent(),'CLIENTE DELTA');
 await page.locator('#company-maps-amount').fill('95,50');
 await page.locator('#company-maps-save').click();
 await page.waitForFunction(()=>document.querySelector('#company-maps-status').textContent.includes('Cliente Google Maps aggiunto'));
 await page.waitForFunction(()=>document.querySelector('#company-rates-count').textContent.includes('3 tariffe aziendali'));
 // Already-linked Maps shortlink: review first, then update only its placeholder.
 await openAdminTab('overview-tab');
 await page.waitForFunction(()=>document.querySelector('#customer-overview-missing').textContent==='1');
 await page.locator('#customer-maps-scan').click();
 await page.waitForFunction(()=>document.querySelector('#customer-maps-refresh-status').textContent.includes('Verifica terminata'));
 assert.match(await page.locator('#customer-maps-results').textContent(),/VIA INDUSTRIA 25/);
 assert.equal(await page.locator('#customer-overview-missing').textContent(),'1',
  'Reading Maps must never silently modify shared customer data');
 await page.locator('#customer-maps-select-all').check();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#customer-maps-apply').click();
 await page.waitForFunction(()=>document.querySelector('#customer-overview-missing').textContent==='0');
 assert.match(await page.locator('#customer-maps-refresh-status').textContent(),/1 indirizzi aggiornati/);
 assert.equal(await page.locator('#customer-overview-total').textContent(),'6',
  'The earlier new customer is included, but updating a linked Maps address must create no duplicate');
 await page.locator('#customer-overview-filter').selectOption('manual');
  assert.equal(await page.locator('.customer-directory-site').count(),2);
  assert.equal(await page.locator('.customer-directory-maps').count(),0);
  await page.locator('#customer-overview-filter').selectOption('all');
  await openAdminTab('security-tab');
 await page.locator('#security-check').click();
 await page.waitForFunction(()=>document.querySelector('#security-result').textContent.includes('MFA confermata'));
 assert.equal(await page.locator('#report-panel').isVisible(),false,'Security view must hide reports');
 await openAdminTab('report-tab');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 // Authorized search must be cleared immediately on logout, even with an open preview.
 await page.locator('#smart-command-open').click();
 await page.locator('#smart-search').fill('ROSSI');
 await page.locator('#smart-results .smart-result-buttons button').first().click();
 assert.equal(await page.locator('#smart-detail').isVisible(),true);
 await page.locator('#logout').evaluate(element=>element.click());
 await page.waitForFunction(()=>document.querySelector('#dashboard').hidden===true);
 assert.equal(await page.locator('#smart-overlay').isVisible(),false);
 assert.equal(await page.locator('#smart-detail-body').textContent(),'');
 assert.equal(await page.locator('#smart-search').inputValue(),'');
 assert.equal(await page.locator('#roster-count').textContent(),'');
 assert.equal(await page.locator('#report-count').textContent(),'—');
 assert.equal(await page.locator('#report-rows tr').count(),0);
 assert.equal(await page.locator('#report-driver-cards .report-person-card').count(),0);
 assert.equal(await page.locator('#report-driver-profile').isVisible(),false);
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),0);
 assert.equal(await page.locator('#pro-records .pro-record').count(),0);
 assert.equal(await page.locator('#pro-export-pdf').isDisabled(),true);
 assert.equal(await page.locator('#login-panel').isVisible(),true);
 await page.locator('#login-password').fill('example-password-for-visibility');
 assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
 await page.locator('#login-password-toggle').click();
 assert.equal(await page.locator('#login-password').getAttribute('type'),'text');
 assert.equal(await page.locator('#login-password-toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#login-password-toggle').click();
 assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
 assert.equal(errors.length,0,'No JavaScript errors: '+errors.join(';'));
 // Data source remains read-only, notes never render as HTML, and no horizontal page scroll on mobile.
 assert.equal(await page.locator('#report-month').inputValue(),'2026-11');
 console.log('PASS '+engine+' mobile 390px: nine real pages, admin MFA, charts, filters, PDF/Excel, anomaly drill-down, security, logout wipe');
 await page.close();
 // Desktop navigation: the protected dashboard must retain working tabs with its
 // new dark sidebar; never make a non-verified page visible via CSS.
 const desktop=await browser.newPage({viewport:{width:1440,height:900}});
 const desktopErrors=[];desktop.on('pageerror',e=>desktopErrors.push(String(e)));
 await desktop.goto(origin+'/amministratore/',{waitUntil:'networkidle',timeout:20000});
 await desktop.locator('#dashboard').waitFor({state:'visible'});
 const nav=desktop.locator('#dashboard>.admin-switch');
 const navBox=await nav.boundingBox(),contentBox=await desktop.locator('#report-panel').boundingBox();
 assert(navBox&&contentBox&&navBox.x+navBox.width<contentBox.x,
  'Professional left sidebar must be beside the admin content');
 assert.equal(await nav.evaluate(e=>getComputedStyle(e).position),'sticky');
 assert.equal(await desktop.locator('.admin-nav-brand').isVisible(),true);
 assert.equal(await nav.locator('button').count(),9);
 assert.equal(await desktop.locator('#dashboard').getAttribute('data-view'),'overview');
 await desktop.locator('#report-tab').click();
 await desktop.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.equal(await desktop.locator('#report-panel').isVisible(),true);
 assert.equal(await desktop.locator('#management-panel').isVisible(),false);
 assert.equal(desktopErrors.length,0,desktopErrors.join(';'));
 await desktop.close();
 // Shared driver theme visual regression with fixed DOM; avoid reading real
 // trips or depending on network authentication for a CSS-only change.
 const driver=await browser.newPage({viewport:{width:1440,height:900}});
 await driver.setContent('<div id="app"><div class="app-frame"><div class="app-scroll"><header class="topbar">LTS</header><main class="app-main"><h1>Registro viaggi</h1></main></div><nav class="bottom-nav"><button class="nav-item active">Viaggi</button><button class="nav-item">Clienti</button></nav></div></div>');
 await driver.addStyleTag({path:resolve(dir,'app.css')});
 await driver.addStyleTag({path:resolve(dir,'pro-theme.css')});
 const dnav=await driver.locator('.bottom-nav').boundingBox();
 const dscroll=await driver.locator('.app-scroll').boundingBox();
 assert(dnav&&dscroll&&dnav.x+dnav.width<=dscroll.x+1,'Desktop driver nav stays separate from content');
 assert.equal(await driver.locator('.bottom-nav').evaluate(e=>getComputedStyle(e).position),'sticky');
 await driver.setViewportSize({width:390,height:844});
 const mobileNav=await driver.locator('.bottom-nav').boundingBox();
 assert(mobileNav&&mobileNav.width>=380,'Mobile retains full-width navigation');
 await driver.close();
 console.log('PASS LTS Pro theme: desktop admin sidebar, live report tabs, driver desktop sidebar and mobile nav.');
} finally {
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
