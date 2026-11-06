/** Combined customer and site choices for trip forms. Read-only and owner-neutral. */
const normalizeCustomerKey=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Merge suggestions for the trip editor without changing the personal archive.
 * Locations are intentionally distinct for customers with more than one site.
 */
export function combinedTripCustomerChoices({personal=[],trips=[],shared=[]}={}){
 const result=new Map();
 const add=(row,source,nameKey='name',cityKey='city')=>{
  if(!row||typeof row!=='object')return;
  const name=String(row[nameKey]??'').trim();
  if(!name)return;
  const city=String(row[cityKey]??'').trim();
  const address=String(row.address??'').trim();
  const key=normalizeCustomerKey(name)+'|'+normalizeCustomerKey(city);
  if(!result.has(key))result.set(key,{name,city,address,fromCompany:source==='shared'});
  else{
   const saved=result.get(key);
   if(!saved.address&&address)saved.address=address;
   if(source==='shared')saved.fromCompany=true;
  }
 };
 for(const entry of personal)add(entry,'personal');
 for(const trip of trips){
  add(trip,'trip','client','city');
  add(trip,'trip','secondClient','secondCity');
 }
 for(const entry of shared)add(entry,'shared');
 return [...result.values()].sort((a,b)=>
  a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it'));
}
