/** Provenance gate: only a new customer saved from the Maps-link dialog
 * may be submitted to the protected company registry. No manual/CSV/trip edits. */
import {checkedGoogleMapsUrl} from './maps-client.mjs';
export function mapsLinkForCompanySync({existingCustomer=null,proposal=null,enabled=false}={}){
 if(!enabled||existingCustomer||!proposal||typeof proposal.mapsUrl!=='string')return null;
 return checkedGoogleMapsUrl(proposal.mapsUrl).href;
}

/** Search the read-only company catalog without touching personal customer data.
 * Match all query words across name, location, street and operational hints.
 * Accents and punctuation do not change the result. Never mutate the input.
 */
const normalizeSearch=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function filterSharedCustomers(customers,query=''){
 const rows=Array.isArray(customers)?customers:[];
 const words=normalizeSearch(query).split(/\s+/u).filter(Boolean);
 if(!words.length)return rows;
 return rows.filter(customer=>{
  const text=normalizeSearch([customer.name,customer.city,customer.address,customer.operationalNotes].join(' '));
  return words.every(word=>text.includes(word));
 });
}
