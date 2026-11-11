/** Read-only checks and usage suggestions. No record or saved amount is changed. */
import {normalizeContainer,normalizeText,validateTrip,MAX_CENTS} from './domain.mjs';
import {possibleTripDuplicate} from './trip-editor-safety.mjs';

const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const money=value=>Number.isSafeInteger(value)&&value>=0&&value<=MAX_CENTS;
const own=(row,key)=>Boolean(row&&Object.hasOwn(row,key));
const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'it',{sensitivity:'base',numeric:true});
function calendarDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return '';
 const time=Date.parse(value+'T12:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:'';
}

/** ISO 6346 is advisory: BILICO and other special descriptions remain valid.
 * Neither a warning nor a successful checksum certifies a real container.
 */
export function inspectContainer(value){
 const normalized=normalizeContainer(value),compact=normalized.replace(/[.\s-]/gu,'');
 if(!normalized)return {kind:'missing',iso:false,checksumValid:null};
 const shape=/^[A-Z]{3}[UJZ]\d{7}$/u.test(compact);
 if(!shape){
  const resemblesIso=/^[A-Z]{3,5}\d/iu.test(compact);
  return {kind:resemblesIso?'iso-shape-warning':'special',iso:false,checksumValid:null};
 }
 let total=0;
 for(let index=0;index<10;index++){
  const char=compact[index];
  let number=Number(char);
  if(index<4){number=char.charCodeAt(0)-55;number+=Math.floor((number-1)/10);}
  total+=number*(2**index);
 }
 const checksumValid=(total%11)%10===Number(compact[10]);
 return {kind:checksumValid?'iso-valid':'iso-checksum-warning',iso:true,checksumValid};
}

/** Customer/city identity keeps punctuation; tolerant search is a separate step. */
export const tripCustomerRouteKey=(name,city)=>JSON.stringify([normalizeText(name),normalizeText(city)]);

/** Count each journey once per route/city, including both pickups. Undated
 * records contribute frequency without inventing a recent date or a warehouse.
 */
export function buildOperationalSuggestions({trips=[],limit=50}={}){
 const routes=new Map(),cities=new Map();
 list(trips).forEach((trip,index)=>{
  if(!trip||typeof trip!=='object')return;
  const tripId=text(trip.id),identity=JSON.stringify([text(trip.driverId),tripId||'row:'+index]);
  const date=calendarDay(trip.date),seenRoutes=new Set(),seenCities=new Set();
  for(const [nameField,cityField,pickup] of [['client','city','first'],['secondClient','secondCity','second']]){
   const name=text(trip[nameField]),city=text(trip[cityField]);
   if(name){
    const key=tripCustomerRouteKey(name,city);
    const row=routes.get(key)||{name,city,usageCount:0,lastUsedDate:null,tripIds:[],pickups:[],identities:new Set()};
    if(!seenRoutes.has(key)&&!row.identities.has(identity)){
     row.usageCount++;row.identities.add(identity);if(tripId)row.tripIds.push(tripId);
    }
    if(date&&(!row.lastUsedDate||date>row.lastUsedDate))row.lastUsedDate=date;
    if(!row.pickups.includes(pickup))row.pickups.push(pickup);
    routes.set(key,row);seenRoutes.add(key);
   }
   if(city){
    const key=normalizeText(city),row=cities.get(key)||{city,usageCount:0,lastUsedDate:null,tripIds:[],identities:new Set()};
    if(!seenCities.has(key)&&!row.identities.has(identity)){
     row.usageCount++;row.identities.add(identity);if(tripId)row.tripIds.push(tripId);
    }
    if(date&&(!row.lastUsedDate||date>row.lastUsedDate))row.lastUsedDate=date;
    cities.set(key,row);seenCities.add(key);
   }
  }
 });
 const count=Number.isFinite(limit)?Math.max(0,Math.min(200000,Math.trunc(limit))):50;
 const ranked=rows=>[...rows.values()].sort((a,b)=>b.usageCount-a.usageCount||
  compare(b.lastUsedDate,a.lastUsedDate)||compare(a.name,b.name)||compare(a.city,b.city))
  .slice(0,count).map(({identities,...row})=>({...row,confidence:'suggestion'}));
 return {customers:ranked(routes),cities:ranked(cities),scope:'both-pickups'};
}

function samePickup(a,b,second=false){
 const name=second?'secondClient':'client',city=second?'secondCity':'city';
 return normalizeText(a?.[name])===normalizeText(b?.[name])&&normalizeText(a?.[city])===normalizeText(b?.[city]);
}

/** Validity comes from the existing domain validator. All additional findings
 * are evidence to review, never replacement values or permission to reprice.
 * A catalogue is authoritative only with an explicit Loaded=true flag.
 */
export function collectOperationalChecks(trip,{trips=[],editingId=null,previous,
 companyRates=[],companyRatesLoaded=false,extraRates=[],extraRatesLoaded=false}={}){
 const validation=validateTrip(trip),checks=[],container=inspectContainer(trip?.container);
 const currentId=text(trip?.id),ownIds=currentId?[currentId]:[];
 const add=(code,confidence,field,message,evidence={},tripIds=ownIds)=>
  checks.push({code,confidence,field,message,evidence,tripIds:[...new Set(tripIds.filter(Boolean))]});
 for(const [field,message] of Object.entries(validation.errors)){
  add('invalid_'+field,'certain',field,message,{source:'domain-validation'});
 }
 if(container.kind==='iso-shape-warning')add('container_iso_shape','possible','container',
  'Verifica la sigla container: il formato ISO non è completo.',{source:'iso-6346',kind:container.kind});
 if(container.kind==='iso-checksum-warning')add('container_iso_checksum','possible','container',
  'Verifica la sigla container: la cifra di controllo ISO non corrisponde.',{source:'iso-6346',kind:container.kind});
 const duplicates=list(trips).filter(row=>row&&row.id!==(editingId??currentId)&&
  samePickup(row,trip,true)&&possibleTripDuplicate([row],trip,editingId??currentId));
 if(duplicates.length)add('trip_possible_duplicate','possible','container',
  'Esiste già un viaggio con la stessa data, container e percorso. Verifica prima di salvare.',
  {source:'saved-trips',matchedFields:['date','container','client','city','secondClient','secondCity']},
  [...ownIds,...duplicates.map(row=>text(row.id))]);
 // Only a saved snapshot (including an explicit null) can establish historical
 // absence. A new draft's null estimate while offline means unknown.
 const saved=previous??(currentId?trip:null);
 for(const [second,nameField,cityField,fareField] of [[false,'client','city','fareCents'],[true,'secondClient','secondCity','secondFareCents']]){
  if(!text(trip?.[nameField])||!text(trip?.[cityField]))continue;
  if(second&&trip?.sumPickupFares===false)continue;
  const retained=saved&&samePickup(saved,trip,second)&&own(saved,fareField);
  if(retained){
   if(saved[fareField]===null||saved[fareField]===undefined)add('tariff_missing','certain',fareField,
    'La tariffa non è impostata nel viaggio salvato.',{source:'historical-snapshot',client:trip[nameField],city:trip[cityField]});
   else if(!money(saved[fareField]))add('tariff_invalid','certain',fareField,
    'L’importo salvato deve essere verificato.',{source:'historical-snapshot'});
   continue;
  }
  if(!companyRatesLoaded)continue;
  const rates=list(companyRates).filter(rate=>normalizeText(rate?.client)===normalizeText(trip[nameField])&&
   normalizeText(rate?.city)===normalizeText(trip[cityField]));
  if(rates.length>1&&new Set(rates.map(rate=>rate.cents)).size>1){
   add('tariff_ambiguous','possible',fareField,'Il listino contiene più importi per questo percorso.',
    {source:'loaded-company-rates',matches:rates.length});
  }else if(!rates.length||!money(rates[0].cents))add('tariff_missing','certain',fareField,
   'La tariffa non è impostata nel listino aziendale caricato.',
   {source:'loaded-company-rates',client:trip[nameField],city:trip[cityField]});
 }
 for(const key of list(trip?.services)){
  const field='extraCents.'+key,retained=saved&&list(saved.services).includes(key)&&own(saved.extraCents,key);
  if(retained){
   if(saved.extraCents[key]===null||saved.extraCents[key]===undefined)add('extra_tariff_missing','certain',field,
    'La tariffa del servizio non è impostata nel viaggio salvato.',{source:'historical-snapshot',service:key});
   else if(!money(saved.extraCents[key]))add('extra_tariff_invalid','certain',field,
    'L’importo del servizio salvato deve essere verificato.',{source:'historical-snapshot',service:key});
  }else if(extraRatesLoaded){
   const rate=list(extraRates).find(row=>row?.serviceKey===key);
   if(!money(rate?.cents))add('extra_tariff_missing','certain',field,
    'La tariffa del servizio non è impostata nel listino aziendale caricato.',{source:'loaded-company-extras',service:key});
  }
 }
 return {valid:validation.valid,checks,container};
}
