/** Read-only client-directory deduplication.
 * The service/database owns shared writes and a unique normalized site key.
 * Personal contacts, journeys, historical fares and CSV archives are untouched.
 * Never collapse distinct warehouses merely because names and cities match.
 */
const normal=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleUpperCase('it-IT').trim();
const simple=value=>normal(value).replace(/[^A-Z0-9]/gu,'');
// Search may be forgiving; identity must retain punctuation and accents. A
// personal alias such as ACME-SRL is not proof that it is company ACME SRL.
const nameKey=customer=>String(customer?.name??'').normalize('NFC')
 .toLocaleUpperCase('it-IT').replace(/\s+/gu,' ').trim();
const cityKey=customer=>simple(normal(customer?.city)
 .replace(/\s*\([A-Z]{2}\)\s*$/u,''));
const placeholder=value=>/INDIRIZZO(?: STRADALE)? DA CONFERMARE/u.test(normal(value));
export function normalizedStreetKey(value){
 const text=normal(value);
 if(!text||placeholder(text))return '';
 return simple(text.replace(/(^|[^A-Z0-9])N[.]?\s*C[.]?([^A-Z0-9]|$)/gu,'$1$2'));
}
function locationCandidates(shared,record){
 const name=nameKey(record),city=cityKey(record);
 if(!name||!city)return [];
 return shared.filter(item=>nameKey(item)===name&&cityKey(item)===city);
}
/** Drop known tracking parameters only. Query, place IDs and coordinates are
 * part of a Maps destination, including links using the common /maps/search/.
 */
export function normalizedMapsSiteKey(value){
 if(!value)return '';
 try{
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol))return '';
  for(const key of [...url.searchParams.keys()]){
   if(/^utm_/iu.test(key)||/^(?:g_st|g_ep|gclid|fbclid|igshid)$/iu.test(key))url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
 }catch{return '';}
}
export function sameMapsLink(a,b){
 if(!a?.mapsUrl||!b?.mapsUrl)return false;
 const first=normalizedMapsSiteKey(a.mapsUrl),second=normalizedMapsSiteKey(b.mapsUrl);
 return Boolean(first&&first===second);
}
export function sameSharedSite(a,b){
 if(nameKey(a)!==nameKey(b)||cityKey(a)!==cityKey(b)||!nameKey(a)||!cityKey(a))return false;
 const streetA=normalizedStreetKey(a?.address),streetB=normalizedStreetKey(b?.address);
 if(streetA&&streetB&&streetA!==streetB)return false;
 return (Boolean(streetA&&streetB&&streetA===streetB))||sameMapsLink(a,b);
}
/** A personal record with no street is safely matched only when a single
 * company site has that exact name and municipality. */
export function matchingSharedCustomer(shared,record){
 const candidates=locationCandidates(shared,record);
 const street=normalizedStreetKey(record?.address);
 if(street){
  return candidates.find(item=>normalizedStreetKey(item.address)===street)||null;
 }
 return candidates.length===1?candidates[0]:null;
}
export function dedupedCustomerDirectory(shared,personal){
 // Group by company+municipality before checking individual site identity.
 // Distinct warehouses remain separate even when their name and city match.
 const siteBuckets=new Map(),uniqueShared=[];
 const bucketKey=site=>nameKey(site)+'|'+cityKey(site);
 for(const site of Array.isArray(shared)?shared:[]){
  const key=bucketKey(site),bucket=siteBuckets.get(key)||[];
  if(!bucket.some(other=>sameSharedSite(other,site))){
   uniqueShared.push(site);bucket.push(site);siteBuckets.set(key,bucket);
  }
 }
 const uniquePersonal=[],matchedPersonal=[],localPhoneByShared=new Map();
 for(const person of Array.isArray(personal)?personal:[]){
  const candidates=siteBuckets.get(bucketKey(person))||[];
  const matched=matchingSharedCustomer(candidates,person);
  if(matched){
   matchedPersonal.push({personal:person,shared:matched});
   if(person.phone&&!localPhoneByShared.has(matched))localPhoneByShared.set(matched,person.phone);
  }else uniquePersonal.push(person);
 }
 // Personal phones are display-only and are never sent to the shared service.
 const shownShared=uniqueShared.map(site=>{
  const phone=localPhoneByShared.get(site);
  return phone&&!site.phone?{...site,phone}:site;
 });
 return {shared:shownShared,personal:uniquePersonal,matchedPersonal};
}

/** Return the exact owned archive record, not the copy decorated for display.
 * The directory adds view-only fields (e.g. directorySource) which must not
 * cause a false "changed on another device" error during editing/deletion.
 * Never match a customer by name or accept a company-only shared card. */
export function canonicalPersonalCustomer(personalCustomers,selection){
 if(!Array.isArray(personalCustomers)||!selection||typeof selection!=='object'||
    selection.directorySource==='shared'||
    typeof selection.id!=='string'||!selection.id.trim())return null;
 return personalCustomers.find(entry=>entry.id===selection.id)??null;
}
