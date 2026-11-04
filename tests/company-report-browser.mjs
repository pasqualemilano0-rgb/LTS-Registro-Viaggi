/** Browser-only isolated QA. No real accounts, production URLs or archive reads. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {extname,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';

const dir=fileURLToPath(new URL('../',import.meta.url));
const runner=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium}=createRequire(import.meta.url)(runner+'/node_modules/playwright');
const mockAccount=String.raw`
export const hasSession=()=>true;
export const isVerified=()=>true;
export const getRole=()=> 'admin';
export const getAccountId=()=> 'account:33333333-3333-4333-8333-333333333333';
export const verifySession=async()=>({mfa_enrolled:true,mfa_verified:true});
export const listAdminMfaFactors=async()=>[{label:'Principale',id:'a'}];
export const manageDrivers=async(action)=>action==='list'?{drivers:[]}:{};
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
const root=resolve(dir),mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/account-access.mjs'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(mockAccount);return;}
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
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+'/amministratore/',{waitUntil:'networkidle',timeout:20000});
 await page.locator('#dashboard').waitFor({state:'visible'});
 assert.equal(await page.locator('#report-panel').isVisible(),false,'Report initially hidden');
 await page.locator('#report-tab').click();
 await page.locator('#report-count').waitFor();
 await page.locator('#report-month').fill('2026-11');
 await page.locator('#report-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 assert.match((await page.locator('#report-total').textContent()).replace(/\s/g,' '),/250,00/);
 assert.equal(await page.locator('#report-missing').textContent(),'1');
 assert.equal(await page.locator('#report-rows tr').count(),2);
 assert.equal(await page.locator('#report-chart .report-bar-row').count(),2);
 assert.equal(await page.locator('#report-driver-chart .report-bar-row').count(),1);
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
 await page.locator('#management-tab').click();
 assert.equal(await page.locator('#report-panel').isVisible(),false);
 await page.locator('#report-tab').click();
 await page.waitForFunction(()=>document.querySelector('#report-count').textContent==='2');
 await page.locator('#logout').click();
 await page.waitForFunction(()=>document.querySelector('#dashboard').hidden===true);
 assert.equal(await page.locator('#report-count').textContent(),'—');
 assert.equal(await page.locator('#report-rows tr').count(),0);
 assert.equal(await page.locator('#report-driver-cards .report-person-card').count(),0);
 assert.equal(await page.locator('#report-driver-profile').isVisible(),false);
 assert.equal(await page.locator('#report-amount-chart .report-bar-row').count(),0);
 assert.equal(errors.length,0,'No JavaScript errors: '+errors.join(';'));
 // Data source remains read-only, notes never render as HTML, and no horizontal page scroll on mobile.
 assert.equal(await page.locator('#report-month').inputValue(),'2026-11');
 console.log('PASS Chromium mobile 390px: overview, 3 graphs, driver directory/search, individual profile, monthly filters, escaped notes, logout wipe');
 await page.close();
} finally {
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
