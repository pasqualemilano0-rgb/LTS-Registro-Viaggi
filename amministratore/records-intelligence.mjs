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
const sameIdentity=(a,b)=>validKey(a)&&validKey(b)&&key(a)===key(b);
const trustedStreet=customer=>normalizedStreetKey(customer?.address);
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
 const candidates=sharedSites.filter(site=>sameIdentity(site,customer));
 const streetMatches=street?candidates.filter(site=>trustedStreet(site)===street):[];
 const exact=streetMatches.length===1?streetMatches[0]:null;
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
 const values=(Array.isArray(customers)?customers:[]).map(customer=>
  assessPersonalCustomer(customer,sharedSites));
 const checked=Array.isArray(sharedSites);
 return {
  total:values.length,
  missing:values.filter(v=>v.missingAddress).length,
  possible:checked?values.filter(v=>v.possibleDuplicate).length:null,
  shared:checked?values.filter(v=>v.exactShared).length:null,
  review:values.filter(v=>v.missingAddress||(checked&&v.possibleDuplicate)).length,
  sharedChecked:checked
 };
}
export function customerMatchesQuickFilter(customer,filter='all',sharedSites=null){
 const row=assessPersonalCustomer(customer,sharedSites);
 if(filter==='all')return true;
 if(filter==='missing')return row.missingAddress;
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
