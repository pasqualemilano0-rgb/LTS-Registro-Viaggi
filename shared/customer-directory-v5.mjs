/** LTS Clienti V5: indexed view-only directory + reversible personal deletion.
 * Never merges company data into the driver's archive or writes to shared Maps.
 */
import {sameSharedSite,normalizedStreetKey} from './customer-site-matches.mjs';
import {validateState} from './domain.mjs';

export const CUSTOMER_BATCH_SIZE=24;
const plain=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleUpperCase('it-IT').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const key=value=>plain(value).replace(/\s+/gu,'');
const siteFamily=customer=>key(customer?.name)+'|'+key(String(customer?.city??'').replace(/\s*\([A-Z]{2}\)\s*$/iu,''));
const address=customer=>normalizedStreetKey(customer?.address);
const findIndex=(bucket,customer)=>bucket?.find(row=>sameSharedSite(row,customer))??null;

function searchText(customer){
 const addressText=String(customer?.address??'').replace(/indirizzo\s+stradale\s+da\s+confermare/giu,'');
 return plain([customer.name,customer.city,addressText,customer.phone,customer.vat].join(' '));
}
function directoryRow(customer,source,props={}){
 return {customer,source,searchText:searchText(customer),...props};
}
const sorting=(a,b)=>String(a.customer.name).localeCompare(String(b.customer.name),'it')||
 String(a.customer.city??'').localeCompare(String(b.customer.city??''),'it')||
 (a.source==='shared'?-1:1);

/** Linear index for different customers, with small per-company/site buckets. */
export function buildCustomerDirectory(shared,personal){
 const sharedBuckets=new Map(),allShared=[];
 for(const candidate of Array.isArray(shared)?shared:[]){
  const family=siteFamily(candidate),bucket=sharedBuckets.get(family)??[];
  if(findIndex(bucket,candidate))continue;
  bucket.push(candidate);sharedBuckets.set(family,bucket);allShared.push(candidate);
 }
 const sharedRows=new Map(allShared.map(item=>[item,directoryRow(item,'shared')]));
 const personalRows=[];
 const allPersonal=Array.isArray(personal)?personal:[];
 for(const record of allPersonal){
  const candidates=sharedBuckets.get(siteFamily(record))??[];
  const street=address(record);
  // A missing street cannot prove that two warehouses are the same address.
  const exact=street?candidates.find(candidate=>address(candidate)===street):null;
  const linked=exact&&findIndex(candidates,record)?exact:null;
  if(linked){
   const row=sharedRows.get(linked);
   // Never transmit personal phone numbers or contact details to the shared API.
   if(!row.linkedPersonal)row.linkedPersonal=record;
   if(record.phone)row.searchText+=' '+plain(record.phone);
  }
  personalRows.push(directoryRow(record,'personal',{
   linkedShared:linked??null,possibleDuplicate:!linked&&candidates.length>0,
   duplicateLabel:!linked&&candidates.length>0?'Possibile cliente aziendale già presente':''
  }));
 }
 const sharedList=[...sharedRows.values()].sort(sorting);
 const personalList=personalRows.sort(sorting);
 const combined=[...sharedList,...personalList.filter(row=>!row.linkedShared)].sort(sorting);
 return {shared:sharedList,personal:personalList,all:combined};
}

/** One normalized search over an already indexed directory; no DOM work here. */
export function queryCustomerDirectory(directory,{query='',scope='all',limit=CUSTOMER_BATCH_SIZE}={}){
 if(!directory||!['all','shared','personal'].includes(scope))throw new Error('Filtro clienti non valido.');
 const words=plain(String(query).slice(0,120)).split(' ').filter(Boolean);
 const filter=rows=>rows.filter(row=>words.every(word=>row.searchText.includes(word)));
 const all=filter(directory.all),shared=filter(directory.shared),personal=filter(directory.personal);
 const visible=scope==='shared'?shared:scope==='personal'?personal:all;
 const size=Math.max(CUSTOMER_BATCH_SIZE,Math.min(10000,Number.isSafeInteger(limit)?limit:CUSTOMER_BATCH_SIZE));
 return {visible:visible.slice(0,size),total:visible.length,hasMore:visible.length>size,
  counts:{all:all.length,shared:shared.length,personal:personal.length}};
}

/** Deletion only affects this driver's own customer and legacy personal tariffs. */
export function removePersonalCustomer(state,id){
 const customer=state.customers.find(row=>row.id===id);
 if(!customer)throw new Error('Cliente personale non più disponibile. Aggiorna la rubrica.');
 const tariffs=state.tariffs.filter(row=>row.customerId===id||row.client===customer.name);
 const snapshot={customer:structuredClone(customer),tariffs:structuredClone(tariffs)};
 const removed=new Set(tariffs.map(row=>row.id));
 const next=validateState({...state,customers:state.customers.filter(row=>row.id!==id),
  tariffs:state.tariffs.filter(row=>!removed.has(row.id))});
 return {next,snapshot};
}

/** One-level undo; refuse any ID/name/tariff collision rather than overwriting. */
export function restorePersonalCustomer(state,snapshot){
 if(!snapshot||!snapshot.customer||!Array.isArray(snapshot.tariffs))
  throw new Error('Nessun cliente eliminato da recuperare.');
 const customer=snapshot.customer,tariffs=snapshot.tariffs;
 if(state.customers.some(item=>item.id===customer.id||item.name===customer.name))
  throw new Error('Il cliente è stato ricreato o aggiornato: il ripristino automatico non può sovrascriverlo.');
 const existingIds=new Set(state.tariffs.map(row=>row.id));
 const existingRoutes=new Set(state.tariffs.map(row=>JSON.stringify([row.client,row.city])));
 if(tariffs.some(item=>existingIds.has(item.id)||existingRoutes.has(JSON.stringify([item.client,item.city]))))
  throw new Error('Le tariffe sono cambiate: ripristino sospeso per non sovrascrivere dati.');
 return validateState({...state,customers:[...state.customers,structuredClone(customer)],
  tariffs:[...state.tariffs,...structuredClone(tariffs)]});
}
