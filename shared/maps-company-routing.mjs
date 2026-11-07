/** Provenance gate: only a new customer saved from the Maps-link dialog
 * may be submitted to the protected company registry. No manual/CSV/trip edits. */
import {checkedGoogleMapsUrl} from './maps-client.mjs';
export function mapsLinkForCompanySync({existingCustomer=null,proposal=null,enabled=false}={}){
 if(!enabled||existingCustomer||!proposal||typeof proposal.mapsUrl!=='string')return null;
 return checkedGoogleMapsUrl(proposal.mapsUrl).href;
}

/** Search company and personal customers by real, useful fields only.
 * Skip placeholder address wording; never let generic operational notes make
 * every row look like a match. Accent- and case-insensitive, all terms required. */
const normalizeSearch=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function filterSharedCustomers(customers,query=''){
 const rows=Array.isArray(customers)?customers:[];
 const words=normalizeSearch(query).split(/\s+/u).filter(Boolean);
 if(!words.length)return rows;
 return rows.filter(customer=>{
  const usefulAddress=String(customer?.address??'')
   .replace(/indirizzo\s+stradale\s+da\s+confermare/giu,'');
  const searchable=normalizeSearch([
   customer?.name,customer?.city,usefulAddress,customer?.phone,customer?.vat
  ].join(' '));
  return words.every(word=>searchable.includes(word));
 });
}
/** Alias for consumers that specifically address the customer-directory search. */
export const filterCustomerDirectory=filterSharedCustomers;
