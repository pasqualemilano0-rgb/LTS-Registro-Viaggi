/** LTS Registro Viaggi: conservative, read-only archive worklist.
 * Shared records are never trusted by client name alone as certified.
 * All deletion/sync authorization remains with the server.
 */
import {normalizedStreetKey} from '../shared/customer-site-matches.mjs';
import {buildTripAmountContext,tripAmounts} from '../shared/domain.mjs';

const normalized=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').trim().toLocaleUpperCase('it-IT');
const identity=value=>normalized(value).replace(/[^A-Z0-9]/gu,'');
const key=customer=>identity(customer?.name)+'|'+identity(normalized(customer?.city)
 .replace(/\s*\([A-Z]{2}\)\s*$/u,''));
const validKey=customer=>Boolean(identity(customer?.name)&&identity(customer?.city));
const trustedStreet=customer=>normalizedStreetKey(customer?.address);
// A shared directory is loaded as a snapshot. Build its index once per
// snapshot instead of comparing every personal customer with every shared row.
// The map only holds references to the existing read-only snapshot.
const sharedIndexCache=new WeakMap();
function indexedSharedSites(sharedSites){
 let index=sharedIndexCache.get(sharedSites);
 if(index)return index;
 index=new Map();
 for(const site of sharedSites){
  if(!validKey(site))continue;
  const identityKey=key(site);
  let group=index.get(identityKey);
  if(!group){group=[];index.set(identityKey,group);}
  group.push({site,street:trustedStreet(site)});
 }
 sharedIndexCache.set(sharedSites,index);
 return index;
}
export const RECORD_FILTERS=Object.freeze({
 customer:Object.freeze([
  {key:'all',label:'Tutti'},
  {key:'review',label:'Da verificare'},
  {key:'missing',label:'Senza indirizzo'},
  {key:'possible',label:'Possibili duplicati'},
  {key:'shared',label:'Già condivisi'}
 ]),
 trip:Object.freeze([
  {key:'all',label:'Tutti'},
  {key:'incomplete',label:'Importi da completare'}
 ])
});
/** Classifies only; a match is NOT authorization to delete a private record. */
export function assessPersonalCustomer(customer,sharedSites=null){
 const street=trustedStreet(customer);
 const missingAddress=!street;
 if(!Array.isArray(sharedSites))return {
  missingAddress,sharedChecked:false,exactShared:null,possibleDuplicate:null,
  status:missingAddress?'missing':'unverified',
  label:missingAddress?'Indirizzo mancante':'Condiviso non verificato'
 };
 const candidates=validKey(customer)?
  indexedSharedSites(sharedSites).get(key(customer))||[]:[];
 const streetMatches=street?candidates.filter(row=>row.street===street):[];
 const exact=streetMatches.length===1?streetMatches[0].site:null;
 const ambiguous=streetMatches.length>1;
 const possibleDuplicate=(candidates.length>0&&!exact)||ambiguous;
 const status=exact?'shared':possibleDuplicate?'possible':missingAddress?'missing':'personal';
 return {
  missingAddress,sharedChecked:true,exactShared:exact,
  possibleDuplicate,status,label:status==='shared'?'Già condiviso':
   status==='possible'?'Possibile duplicato':
   status==='missing'?'Indirizzo mancante':'Cliente personale'
 };
}
export function archiveCustomerMetrics(customers=[],sharedSites=null){
 const records=Array.isArray(customers)?customers:[];
 const checked=Array.isArray(sharedSites);
 let missing=0,possible=0,shared=0,review=0;
 for(const customer of records){
  const row=assessPersonalCustomer(customer,sharedSites);
  if(row.missingAddress)missing++;
  if(checked&&row.possibleDuplicate)possible++;
  if(checked&&row.exactShared)shared++;
  if(row.missingAddress||(checked&&row.possibleDuplicate))review++;
 }
 return {
  total:records.length,missing,
  possible:checked?possible:null,
  shared:checked?shared:null,
  review,sharedChecked:checked
 };
}
export function customerMatchesQuickFilter(customer,filter='all',sharedSites=null){
 if(filter==='all')return true;
 if(filter==='missing')return !trustedStreet(customer);
 const row=assessPersonalCustomer(customer,sharedSites);
 if(filter==='possible')return row.possibleDuplicate===true;
 if(filter==='shared')return Boolean(row.exactShared);
 if(filter==='review')return row.missingAddress||row.possibleDuplicate===true;
 return false;
}
export function tripWorklistSummary(trips=[]){
 const records=Array.isArray(trips)?trips:[];
 const context=buildTripAmountContext(records);
 const incompletes=new Set();
 for(const row of records)
  if(tripAmounts(row,context).missingTariff)incompletes.add(String(row.id));
 return {total:records.length,incomplete:incompletes.size,incompleteIds:incompletes};
}
export function archiveMatchesSearch(item,category,term){
 const query=normalized(term).split(/\s+/u).filter(Boolean);
 if(!query.length)return true;
 const fields=category==='trip'?
  [item.client,item.city,item.container,item.date,item.note,item.secondClient,item.secondCity]:
  category==='customer'?
   [item.name,item.city,item.address,item.phone,item.vat]:
  category==='tariff'?[item.client,item.city]:
  category==='extra'?[item.name]:
   [item.category,item.action,item.reason,item.recordId,item.at];
 const haystack=normalized(fields.join(' '));
 return query.every(piece=>haystack.includes(piece));
}


/** Read-only hint: an audit DELETE may be restored only while it is the
 * latest delete/restore event for this record and the record is still absent.
 * Server authorization and revision checks remain authoritative.
 */
export function archivedRestoreStatus(entry,audit=[],state=null){
 const collections={trip:'trips',customer:'customers',tariff:'tariffs'};
 const table=collections[entry?.category];
 if(entry?.action!=='delete'||!table||!entry.recordId||
    !Number.isSafeInteger(entry.afterRevision)||
    !Array.isArray(audit)||!Array.isArray(state?.[table]))
  return {eligible:false,label:'Ripristino non disponibile'};
 const updated=audit.filter(row=>row.category===entry.category&&
  String(row.recordId)===String(entry.recordId)&&
  Number.isSafeInteger(row.afterRevision)&&
  row.afterRevision>entry.afterRevision&&
  ['delete','restore'].includes(row.action));
 if(updated.some(row=>row.action==='restore'))
  return {eligible:false,label:'Già ripristinato'};
 if(updated.length)
  return {eligible:false,label:'Voce superata'};
 if(state[table].some(row=>String(row.id)===String(entry.recordId)))
  return {eligible:false,label:'Elemento già presente'};
 return {eligible:true,label:'Ripristina'};
}
