
/* QA driver archive: this simulates remote storage in the current browser only.
   No real server, no real credentials, no cross-device synchronization.
   Do not reuse in a production release. */
import {emptyState,validateState,buildTripAmountContext,tripAmounts} from '/LTS-Registro-Viaggi/shared/domain.mjs';
export const isEnabled=()=>true;
export const getRealtimeCredentials=()=>null;
export const login=async()=>({mfa_enrolled:true,mfa_verified:true});
export const enrollBackupAdminTotp=async()=>({});
export const enrollAdminTotp=async()=>({});
export const verifyAdminTotp=async()=>({mfa_verified:true});
const QA_DRIVER_OWNER='account:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const QA_DRIVER_KEY='lts-private-demo-driver-state-v1';
function driverSnapshot(){
 try{
  const snapshot=JSON.parse(localStorage.getItem(QA_DRIVER_KEY)||'null');
  if(snapshot&&Number.isInteger(snapshot.revision)&&snapshot.revision>=0)
   return {...snapshot,state:validateState(snapshot.state)};
 }catch{}
 return {revision:1,state:emptyState(),updatedAt:new Date().toISOString()};
}
function qaOfflineError(){
 const error=new Error('QA: dispositivo offline. La copia rimane sul telefono.');
 error.offline=true;return error;
}
export async function archiveRequest(method,body){
 if(navigator.onLine===false)throw qaOfflineError();
 const stored=driverSnapshot();
 const response=record=>({user:{id:QA_DRIVER_OWNER,linked:true},
  linked:true,revision:record.revision,state:structuredClone(record.state),
  updatedAt:record.updatedAt});
 if(method==='GET')return response(stored);
 if(method!=='POST')throw Error('Metodo non disponibile in QA.');
 if(body?.expectedUserId!==QA_DRIVER_OWNER){
  const error=new Error('QA: archivio differente.');error.status=403;throw error;
 }
 if(body?.baseRevision!==stored.revision){
  const error=new Error('QA: conflitto di revisione.');
  error.status=409;throw error;
 }
 if(typeof body?.requestId!=='string'||body.requestId.length<8)
  throw Error('QA: identificativo richiesta mancante.');
 const next={revision:stored.revision+1,
  state:validateState(body.state),updatedAt:new Date().toISOString()};
 localStorage.setItem(QA_DRIVER_KEY,JSON.stringify(next));
 return response(next);
}

/* QA PRIVATA — dati completamente sintetici; NON caricare su main. */

export const hasSession=()=>true;
export const isVerified=()=>true;
export const getRole=()=> 'admin';
export const getAccountId=()=> 'account:33333333-3333-4333-8333-333333333333';
export const verifySession=async()=>({mfa_enrolled:true,mfa_verified:true,user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
export const listAdminMfaFactors=async()=>[{label:'Principale',id:'a'}];
export const manageDrivers=async(action)=>action==='list'?{drivers:[
 {id:'11111111-1111-4111-8111-111111111111',
  firstName:'Mario',lastName:'Rossi',phone:'+393331111111',
  status:'active',enabled:true}
]}:{};
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
 tariffs:[],extraRates:{adr:null,reefer:null,pernotto:null,preOrario:0,
  sabatoPorto:null,sabatoTrasferta:null,facchinaggioBilico:null,facchinaggioReefer:null}
};

// QA fixture only. All data is synthetic, isolated in this browser and never sent to LTS production.
const QA_DEMO_KEY='lts-rc3-private-demo-synthetic-v1';
try{
 const snapshot=JSON.parse(localStorage.getItem(QA_DEMO_KEY)||'null');
 if(snapshot&&snapshot.state&&Array.isArray(snapshot.state.customers)&&Array.isArray(snapshot.audit)){
  adminArchive=structuredClone(snapshot.state);
  adminArchiveRevision=snapshot.revision;
  adminAudit=structuredClone(snapshot.audit);
  for(const [k,v] of snapshot.deleted||[])removedPersonalRecords.set(k,v);
 }
}catch{}
export const adminRecords=async(action,data={})=>{
 if(action==='list')return {drivers:[{id:'11111111-1111-4111-8111-111111111111',
  name:'Mario Rossi',phone:'+393331111111',status:'active',revision:adminArchiveRevision,
  updatedAt:'2026-11-04T08:00:00Z',counts:{trips:1,customers:2,legacyTariffs:0}}]};
 if(action==='read'){await new Promise(resolve=>setTimeout(resolve,90));return {archive:{revision:adminArchiveRevision,
  state:structuredClone(adminArchive),updatedAt:new Date().toISOString()},
  audit:structuredClone(adminAudit)};}
 if(action==='mutate'){
  await new Promise(resolve=>setTimeout(resolve,90));
  if(data.expectedRevision!==adminArchiveRevision)throw new Error('Revision conflict');
  const rows=adminArchive.trips,idx=rows.findIndex(x=>x.id===data.recordId);
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
    adminArchive.customers[customerIndex]={
     ...adminArchive.customers[customerIndex],...data.patch,updatedAt:new Date().toISOString()
    };
   }else if(data.operation==='update'&&data.category==='extra')adminArchive.extraRates[data.recordId]=data.patch.cents;
   else throw new Error('Mock action unavailable');
  adminArchiveRevision++;
  adminAudit.unshift({id:'44444444-4444-4444-8444-444444444444',at:new Date().toISOString(),
   category:data.category,action:data.operation,recordId:data.recordId,reason:data.reason||'',
   beforeRevision:adminArchiveRevision-1,afterRevision:adminArchiveRevision});

  try{
   localStorage.setItem(QA_DEMO_KEY,JSON.stringify({
    revision:adminArchiveRevision,state:adminArchive,audit:adminAudit,
    deleted:[...removedPersonalRecords.entries()]
   }));
  }catch{}
  return {revision:adminArchiveRevision,state:structuredClone(adminArchive),
   audit:structuredClone(adminAudit)};
 }
 throw new Error('Mock action unavailable');
};
export const pendingAdminMfaInfo=()=>null;
export const forgetPendingAdminMfa=()=>{};
export const logout=async()=>({revoked:true});
export const signOut=()=>{};

/* QA dashboard and administrator archives MUST read the same synthetic trips.
   This is intentionally browser-local and cannot access production. */
function qaCompanyRows(){
 const driverId='11111111-1111-4111-8111-111111111111';
 const context=buildTripAmountContext(adminArchive.trips);
 return adminArchive.trips.map(trip=>{
  const amount=tripAmounts(trip,context);
  return {id:String(trip.id),driverId,driverName:'Mario Rossi',
   date:trip.date,container:trip.container,client:trip.client,city:trip.city,
   secondClient:trip.secondClient||'',secondCity:trip.secondCity||'',
   services:[...(trip.services||[])],note:trip.note||'',
   totalCents:amount.totalCents,amountCents:amount.totalCents,
   missingTariff:amount.missingTariff,
   updatedAt:trip.updatedAt||trip.createdAt||new Date().toISOString()};
 }).sort((a,b)=>b.date.localeCompare(a.date));
}
function qaSum(trips){
 return {trips:trips.length,drivers:new Set(trips.map(r=>r.driverId)).size,
  days:new Set(trips.map(r=>r.date)).size,
  totalCents:trips.reduce((sum,r)=>sum+r.totalCents,0),
  missingTariffCount:trips.filter(r=>r.missingTariff).length};
}
export const companyReport=async({month,offset=0,limit=40,driverId=null})=>{
 const all=qaCompanyRows().filter(r=>r.date.startsWith(month+'-'));
 const selected=driverId?all.filter(r=>r.driverId===driverId):all;
 const sum=qaSum(selected);
 const drivers=[
  {id:'11111111-1111-4111-8111-111111111111',name:'Mario Rossi',
   trips:all.length,days:new Set(all.map(r=>r.date)).size,
   totalCents:qaSum(all).totalCents,missingTariffCount:qaSum(all).missingTariffCount,active:true},
  {id:'22222222-2222-4222-8222-222222222222',name:'Lucia Bianchi',
   trips:0,days:0,totalCents:0,missingTariffCount:0,active:false}
 ];
 return {month,reportedAt:new Date().toISOString(),incompleteArchives:0,
  partial:sum.missingTariffCount>0,source:'QA: dati fittizi dello stesso archivio personale',
  summary:{drivers:sum.drivers,trips:sum.trips,
   knownTotalCents:sum.totalCents,missingTariffCount:sum.missingTariffCount},
  drivers,chart:[...new Set(selected.map(x=>x.date))].sort().map(date=>({
   date,count:selected.filter(x=>x.date===date).length,
   totalCents:selected.filter(x=>x.date===date).reduce((n,x)=>n+x.totalCents,0)})),
  trips:selected.slice(offset,offset+limit),pagination:{offset,limit,total:selected.length}};
};
export const companyInsights=async({month,driverId=null,compareDriverId=null,fromDate=null,toDate=null,
 client='',city='',container=''})=>{
 const all=qaCompanyRows();
 const byDriver=rows=>driverId?rows.filter(x=>x.driverId===driverId):rows;
 const current=byDriver(all.filter(x=>x.date.startsWith(month+'-')));
 const [year,monthNumber]=month.split('-').map(Number);
 const prevMonth=new Date(Date.UTC(year,monthNumber-2,1)).toISOString().slice(0,7);
 const previous=byDriver(all.filter(x=>x.date.startsWith(prevMonth+'-')));
 const start=fromDate||month+'-01',end=toDate||month+'-31';
 const base=byDriver(all.filter(x=>x.date>=start&&x.date<=end));
 const matches=(value,term)=>!term||String(value||'').toLocaleLowerCase('it-IT')
  .includes(String(term).toLocaleLowerCase('it-IT'));
 const records=base.filter(x=>matches(x.client,client)&&matches(x.city,city)&&
  matches(x.container,container));
 const months=Array.from({length:12},(_,i)=>{
  const date=new Date(Date.UTC(year,monthNumber-1-(11-i),1));
  const key=date.toISOString().slice(0,7);
  const items=byDriver(all.filter(x=>x.date.startsWith(key+'-')));
  return {month:key,...qaSum(items)};
 });
 const rank=field=>[...new Set(records.map(x=>x[field]))].map(name=>{
  const items=records.filter(x=>x[field]===name);
  return {name,count:items.length,totalCents:qaSum(items).totalCents};
 });
 return {month,reportedAt:new Date().toISOString(),
  range:{fromDate:start,toDate:end},
  selection:{driverId,compareDriverId,client,city,container},
  summary:{...qaSum(records),activeDrivers:qaSum(records).drivers},
  currentMonth:qaSum(current),previousMonth:{month:prevMonth,...qaSum(previous)},
  monthly:months,compareMonthly:compareDriverId?months.map(x=>({...x,trips:0,totalCents:0})):[],
  drivers:[driverId,compareDriverId].filter(Boolean).map(id=>{
   const rows=all.filter(x=>x.driverId===id&&x.date.startsWith(month+'-'));
   return {id,name:id.startsWith('111')?'Mario Rossi':'Lucia Bianchi',...qaSum(rows)};
  }),
  clients:rank('client'),routes:rank('city'),
  options:{clients:[...new Set(all.map(x=>x.client))],cities:[...new Set(all.map(x=>x.city))]},
  daily:[...new Set(records.map(x=>x.date))].map(date=>({
   date,trips:records.filter(x=>x.date===date).length})),
  alerts:records.filter(x=>x.missingTariff).map(x=>({type:'tariff',
   severity:'warning',driverId:x.driverId,driverName:x.driverName,
   date:x.date,detail:'Tariffa incompleta '+x.container})),
  alertTotal:records.filter(x=>x.missingTariff).length,incompleteArchives:0,
  partial:records.some(x=>x.missingTariff),records
 };
};

/* Compatibility-only QA methods. All operations remain synthetic and local. */
export const accountGateRequired=()=>true;
export const rememberPendingAdminMfa=()=>{};
export const pendingAdminMfa=()=>null;
export const chooseDeviceArchive=()=>{throw Error('Demo privata: usa solo l’archivio sintetico.');};
export const restoreDriverSession=async()=>verifySession();
export const getVerifiedAccessToken=async()=> 'QA_FAKE_TOKEN_NEVER_SENT';
export const activateDriverInvitation=async()=>{throw Error('Le attivazioni reali sono disattivate nella QA.');};
export const recoverDriverPassword=async()=>{throw Error('Il recupero credenziali è disattivato nella QA.');};
export const driverCompanyTariffs=async()=>structuredClone(mockRates);
export const driverCompanyCatalog=async()=>({
 tariffs:structuredClone(mockRates),extraRates:structuredClone(mockExtras)
});
