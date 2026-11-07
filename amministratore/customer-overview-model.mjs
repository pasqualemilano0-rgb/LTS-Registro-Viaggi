/** Pure read-only metrics for the authenticated company customer directory. */
export function hasUsableAddress(value){
  if(typeof value!=='string'||!value.trim())return false;
  return !/INDIRIZZO STRADALE DA CONFERMARE|INDIRIZZO DA CONFERMARE|^DA CONFERMARE$/iu.test(value);
}
export function customerDirectoryStats(customers){
  const rows=Array.isArray(customers)?customers:[];
  const complete=rows.filter(row=>hasUsableAddress(row?.address)).length;
  return {total:rows.length,complete,incomplete:rows.length-complete,
    coverage:rows.length?Math.round(100*complete/rows.length):0};
}
export function selectedCustomerSites(customers,filter='incomplete'){
  const rows=Array.isArray(customers)?customers:[];
  const selected=rows.filter(row=>filter==='all'||
    (filter==='complete'?hasUsableAddress(row.address):!hasUsableAddress(row.address)));
  return selected.sort((a,b)=>
    Number(hasUsableAddress(a.address))-Number(hasUsableAddress(b.address))||
    a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it'));
}

/** The same company + site pair is the key used to assign a corporate fare.
 * A Google Maps listing is a source of sites, not proof that a fare exists. */
const normalizeRoute=value=>String(value??'').normalize('NFC').trim()
 .replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
export function customerSiteRateKey(site){
 return normalizeRoute(site?.name??site?.client)+'\u0000'+normalizeRoute(site?.city);
}
export function tariffLinkedCustomerSites(customers,tariffs=[],search=''){
 const rates=new Set((Array.isArray(tariffs)?tariffs:[])
  .map(rate=>normalizeRoute(rate.client)+'\u0000'+normalizeRoute(rate.city)));
 const all=new Map();
 for(const customer of Array.isArray(customers)?customers:[]){
  if(!String(customer?.name??'').trim()||!String(customer?.city??'').trim())continue;
  const key=customerSiteRateKey(customer);
  if(!all.has(key))all.set(key,{...customer,hasRate:rates.has(key)});
 }
 const sites=[...all.values()].sort((a,b)=>a.name.localeCompare(b.name,'it')||
  a.city.localeCompare(b.city,'it'));
 const words=normalizeRoute(search).normalize('NFD').replace(/\p{M}/gu,'')
  .split(/\s+/gu).filter(Boolean);
 const filtered=sites.filter(site=>{
  const address=hasUsableAddress(site.address)?site.address:'';
  const searchable=normalizeRoute([site.name,site.city,address].join(' '))
   .normalize('NFD').replace(/\p{M}/gu,'');
  return words.every(word=>searchable.includes(word));
 });
 const priced=sites.filter(site=>site.hasRate).length;
 return {total:sites.length,priced,unpriced:sites.length-priced,sites:filtered};
}
