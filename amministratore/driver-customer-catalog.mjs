/** Unified, read-only admin customer picker catalog.
 * Shared Maps sites, manually configured company fares and the selected
 * driver's personal customers are merged without writing to any source.
 * Preserve different Google Maps depots sharing the same company/city.
 */
import {customerSiteRateKey} from './customer-overview-model.mjs?v=20261107-client-tariff-sync-v2';

export function buildDriverCustomerCatalog({sharedSites=[],companyRates=[],personalCustomers=[]}={}){
 const result=[],known=new Set();
 const usable=value=>typeof value==='string'&&Boolean(value.trim());
 function put(site,source){
  if(!usable(site?.name)||!usable(site?.city))return;
  const name=site.name.trim(),city=site.city.trim(),address=String(site.address||'').trim();
  const key=customerSiteRateKey({name,city});
  if(!key)return;
  // Google Maps may have multiple distinct entrances within one city;
  // other sources must not duplicate an already registered shared company.
  if(source!=='maps'&&known.has(key))return;
  if(source==='maps'&&result.some(x=>x.source==='maps'&&
   customerSiteRateKey(x)===key&&x.address===address))return;
  result.push({name,city,address,source,mapsUrl:source==='maps'?String(site.mapsUrl||''):''});
  known.add(key);
 }
 for(const site of Array.isArray(sharedSites)?sharedSites:[])put(site,'maps');
 for(const rate of Array.isArray(companyRates)?companyRates:[])
  put({name:rate.client,city:rate.city},'company');
 for(const customer of Array.isArray(personalCustomers)?personalCustomers:[])
  put(customer,'personal');
 const order={maps:0,company:1,personal:2};
 return result.sort((a,b)=>a.name.localeCompare(b.name,'it')||
  a.city.localeCompare(b.city,'it')||order[a.source]-order[b.source]||
  a.address.localeCompare(b.address,'it'));
}

/** Filter by origin while preserving distinct shared depots and safe manual search.
 * "shared" includes Google Maps and company/manual entries; never includes
 * the driver's own private customers, even when names look similar.
 */
export function filterDriverCustomerCatalog(sites,{scope='shared',query=''}={}){
 const normal=value=>String(value??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('it-IT').trim();
 const words=normal(query).split(/\s+/u).filter(Boolean);
 if(!['shared','personal','all'].includes(scope))return [];
 return (Array.isArray(sites)?sites:[]).filter(site=>{
  if(!site||!['maps','company','personal'].includes(site.source))return false;
  if(scope==='shared'&&site.source==='personal')return false;
  if(scope==='personal'&&site.source!=='personal')return false;
  const haystack=normal([site.name,site.city,site.address].join(' '));
  return words.every(word=>haystack.includes(word));
 });
}
