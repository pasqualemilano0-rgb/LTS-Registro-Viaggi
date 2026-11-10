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

/** Match the CUSTOMER NAME while typing a trip, not arbitrary letters inside
 * company names, addresses or cities. One letter means the initial letter.
 * Longer text may also match the beginning of a name word (e.g. "MIL" in
 * "ACETIFICIO ANDREA MILANO"), while name-prefix matches appear first.
 * The separate Clients directory still supports full address/city search.
 */
export function filterTripCustomerChoices(choices,query='',limit=12){
 const needle=normalizeCustomerKey(query);
 if(!needle)return [];
 const tokens=needle.split(' ').filter(Boolean);
 const matches=[];
 for(const row of Array.isArray(choices)?choices:[]){
  const name=normalizeCustomerKey(row?.name);
  if(!name)continue;
  const starts=name.startsWith(needle);
  // For a single character, use only the first letter of the customer name.
  const wordMatch=!starts&&needle.length>1&&name.split(' ').some((word,index,words)=>
   tokens.every((term,offset)=>words[index+offset]?.startsWith(term)));
  if(starts||wordMatch)matches.push({row,rank:starts?0:1});
 }
 matches.sort((a,b)=>a.rank-b.rank||
  a.row.name.localeCompare(b.row.name,'it')||
  String(a.row.city||'').localeCompare(String(b.row.city||''),'it'));
 return matches.slice(0,Math.max(0,Math.min(50,Number.isFinite(limit)?Math.trunc(limit):12)))
  .map(item=>item.row);
}

/** Optional typo-tolerant suggestions. Exact matches always retain priority. */
export function suggestTripCustomerChoices(choices,query='',limit=12){
 const exact=filterTripCustomerChoices(choices,query,limit);
 const clean=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const needle=clean(query);
 if(needle.length<3||exact.length>=limit)return exact;
 const editDistance=(a,b)=>{
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
   const next=[i];
   for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   previous=next;
  }
  return previous[b.length];
 };
 const terms=needle.split(' ');
 const extras=(Array.isArray(choices)?choices:[]).filter(row=>{
  if(exact.includes(row))return false;
  const words=clean(row?.name).split(' ');
  return terms.every(term=>term.length>=3&&words.some(word=>{
   const candidate=word.slice(0,Math.max(term.length-1,Math.min(word.length,term.length+1)));
   return editDistance(term,candidate)<= (term.length>=6?2:1);
  }));
 });
 return [...exact,...extras].slice(0,limit);
}
