/** Combined customer and site choices for trip forms. Read-only and owner-neutral. */
import {buildOperationalSuggestions,tripCustomerRouteKey} from './operational-checks.mjs';
import {sameSharedSite,normalizedStreetKey,normalizedMapsSiteKey} from './customer-site-matches.mjs';
const normalizeCustomerKey=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Merge suggestions for the trip editor without changing the personal archive.
 * Locations are intentionally distinct for customers with more than one site.
 */
export function combinedTripCustomerChoices({personal=[],trips=[],shared=[]}={}){
 const groups=new Map();
 const add=(row,source)=>{
  if(!row||typeof row!=='object')return;
  const name=String(row.name??'').trim();
  if(!name)return;
  const city=String(row.city??'').trim();
  const address=String(row.address??'').trim();
  const mapsUrl=String(row.mapsUrl??'').trim(),key=tripCustomerRouteKey(name,city);
  const bucket=groups.get(key)||[];
  const hasSite=Boolean(normalizedStreetKey(address)||normalizedMapsSiteKey(mapsUrl));
  const saved=bucket.find(candidate=>hasSite?sameSharedSite(candidate,{name,city,address,mapsUrl}):
   !normalizedStreetKey(candidate.address)&&!normalizedMapsSiteKey(candidate.mapsUrl));
  if(saved){
   if(source==='shared'){
    saved.fromCompany=true;
    if(row.siteId??row.id)saved.siteId=String(row.siteId??row.id);
   }
   if(!saved.sources.includes(source))saved.sources.push(source);
  }else{
   const choice={name,city,address,mapsUrl,fromCompany:source==='shared',sources:[source]};
   if(row.siteLabel??row.label)choice.siteLabel=String(row.siteLabel??row.label).trim();
   if(source==='shared'&&(row.siteId??row.id))choice.siteId=String(row.siteId??row.id);
   bucket.push(choice);groups.set(key,bucket);
  }
 };
 // Site identities are established before route-only history is considered.
 for(const entry of shared)add(entry,'shared');
 for(const entry of personal)add(entry,'personal');
 const usage=buildOperationalSuggestions({trips,limit:200000}).customers;
 for(const row of usage){
  const key=tripCustomerRouteKey(row.name,row.city),bucket=groups.get(key)||[];
  if(!bucket.length)add(row,'trip');
  // Frequency belongs to the customer/city route, never an inferred warehouse.
  for(const choice of groups.get(key)||[]){
   Object.assign(choice,{usageCount:row.usageCount,lastUsedDate:row.lastUsedDate,
    usageScope:'customer-city',pickups:[...row.pickups]});
   if(!choice.sources.includes('trip'))choice.sources.push('trip');
  }
 }
 return [...groups.values()].flat().map(choice=>({...choice,
  choiceId:JSON.stringify([choice.name,choice.city,choice.address,normalizedMapsSiteKey(choice.mapsUrl),choice.siteId??'']),
  label:[choice.name,choice.city,choice.siteLabel||choice.address||choice.mapsUrl].filter(Boolean).join(' · ')}))
  .sort((a,b)=>a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it')||a.address.localeCompare(b.address,'it'));
}

const usageRank=(a,b)=>(b.usageCount||0)-(a.usageCount||0)||
 String(b.lastUsedDate||'').localeCompare(String(a.lastUsedDate||''));

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
 matches.sort((a,b)=>a.rank-b.rank||usageRank(a.row,b.row)||
  a.row.name.localeCompare(b.row.name,'it')||
  String(a.row.city||'').localeCompare(String(b.row.city||''),'it')||
  String(a.row.address||'').localeCompare(String(b.row.address||''),'it'));
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
 extras.sort((a,b)=>usageRank(a,b)||String(a.name||'').localeCompare(String(b.name||''),'it'));
 return [...exact,...extras.map(row=>({...row,confidence:'suggestion',suggestionReason:'name-similarity'}))].slice(0,limit);
}
