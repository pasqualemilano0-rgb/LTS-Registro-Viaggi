/** Pure, allowlisted administrator edits. No record or whole archive may be silently overwritten.
 * Company-wide fares are managed through the separate, central tariff endpoint.
 */
import {validateState,normalizeText,validateTrip,SERVICES} from './domain.mjs';
const TYPES={trip:'trips',customer:'customers',tariff:'tariffs'};
const EXTRA_KEYS=new Set(SERVICES.map(s=>s.key));
const KEYS={
 trip:new Set(['date','client','city','container','secondClient','secondCity','note','services',
  'fareCents','secondFareCents','sumPickupFares','extraCents']),
 customer:new Set(['name','city','address','phone','vat']),
 tariff:new Set(['cents'])
};
function requirePatch(patch,allowed){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Modifica non valida.');
 for(const key of Object.keys(patch))if(!allowed.has(key))throw new Error('Campo non modificabile: '+key);
 if(!Object.keys(patch).length)throw new Error('Nessuna modifica selezionata.');
 return patch;
}
function cents(value,nullable=true){
 if(value===null&&nullable)return null;
 if(!Number.isSafeInteger(value)||value<0||value>99999999)throw new Error('Importo in centesimi non valido.');
 return value;
}
function cleanId(value){
 if(typeof value!=='string'||!value.trim()||value.length>128)throw new Error('Identificativo non valido.');
 return value.trim();
}
function nextEntry(category,id,patch,existing,now){
 if(category==='trip'){
  const allowed=requirePatch(patch,KEYS.trip);
  if('fareCents'in allowed)cents(allowed.fareCents);
  if('secondFareCents'in allowed)cents(allowed.secondFareCents);
  if('extraCents'in allowed){
   if(!allowed.extraCents||typeof allowed.extraCents!=='object'||Array.isArray(allowed.extraCents)||
      Object.keys(allowed.extraCents).some(k=>!EXTRA_KEYS.has(k)))
    throw new Error('Servizio extra non valido.');
   for(const amount of Object.values(allowed.extraCents))cents(amount);
  }
  if('sumPickupFares'in allowed&&typeof allowed.sumPickupFares!=='boolean')
   throw new Error('Modalità seconda presa non valida.');
  if('services'in allowed&&(!Array.isArray(allowed.services)||allowed.services.some(v=>!EXTRA_KEYS.has(v))))
   throw new Error('Servizi non validi.');
  const row={...existing,...allowed,id,createdAt:existing?.createdAt||now,updatedAt:now,
    extraCents:{...(existing?.extraCents||{}),...(allowed.extraCents||{})}};
  if(!row.secondCity&&!row.secondClient){row.secondFareCents=null;row.sumPickupFares=false;}
  const v=validateTrip(row);
  if(!v.valid)throw new Error(Object.values(v.errors)[0]);
  return row;
 }
 if(category==='customer'){
  const allowed=requirePatch(patch,KEYS.customer);
  return {...existing,...allowed,id};
 }
 if(category==='tariff'){
  const allowed=requirePatch(patch,KEYS.tariff);
  if(!('cents'in allowed))throw new Error('Inserisci la tariffa in centesimi.');
  cents(allowed.cents,false);
  return {...existing,...allowed,id};
 }
 throw new Error('Archivio non valido.');
}
/** Count only journeys mentioning this exact personal customer and location.
 * No ID relation exists on trips, so never match on name alone.
 */
export function linkedCustomerTripCount(state,customer){
 if(!customer||!normalizeText(customer.name)||!normalizeText(customer.city))return 0;
 const name=normalizeText(customer.name),city=normalizeText(customer.city);
 return (Array.isArray(state?.trips)?state.trips:[]).filter(t=>
  (normalizeText(t.client)===name&&normalizeText(t.city)===city)||
  (normalizeText(t.secondClient)===name&&normalizeText(t.secondCity)===city)).length;
}

export function applyAdminRecordEdit(raw,{action,category,id,patch={},restoreRecord=null,updateLinkedTrips=false}={},now=new Date().toISOString()){
 if(typeof updateLinkedTrips!=='boolean'||(updateLinkedTrips&&(action!=='update'||category!=='customer')))
  throw new Error('Aggiornamento viaggi non consentito.');
 const state=validateState(raw);
 if(!['trip','customer','tariff','extra'].includes(category))throw new Error('Tipo di dato non consentito.');
 if(!['create','update','delete','restore'].includes(action))throw new Error('Operazione non consentita.');
 const key=cleanId(id);
 const name=TYPES[category];
 if(category==='extra'){
  if(!EXTRA_KEYS.has(key)||action!=='update')throw new Error('Servizio extra non modificabile.');
  requirePatch(patch,new Set(['cents']));
  const value=cents(patch.cents);
  const before={key,cents:state.extraRates[key]};
  const after={key,cents:value};
  state.extraRates={...state.extraRates,[key]:value};
  return {state:validateState(state),before,after};
 }
 const collection=state[name],index=collection.findIndex(x=>x.id===key);
 const original=index>=0?collection[index]:null;
 let before=original,after=null;
 if(action==='create'||action==='restore'){
  if(original)throw new Error('Elemento già presente: aggiorna prima il registro.');
  if(action==='restore'){
   if(!restoreRecord||restoreRecord.id!==key||typeof restoreRecord!=='object')
    throw new Error('Ripristino non valido.');
   after=restoreRecord;
  }else after=nextEntry(category,key,patch,null,now);
  collection.push(after);
 }else{
  if(!original)throw new Error('Elemento non trovato: aggiorna l’archivio.');
  if(action==='delete'){
   collection.splice(index,1);
   if(category==='customer'){
    state.tariffs=state.tariffs.map(t=>t.customerId===key?{...t,customerId:null}:t);
   }
  }else{
   after=nextEntry(category,key,patch,original,now);
   collection[index]=after;
   if(category==='customer'&&after.name!==original.name){
    // Keep linked legacy personal tariffs referentially valid; retain their amounts.
    state.tariffs=state.tariffs.map(t=>t.customerId===key?{...t,client:normalizeText(after.name)}:t);
   }
   if(category==='customer'&&updateLinkedTrips){
    const oldName=normalizeText(original.name),oldCity=normalizeText(original.city);
    if(!oldName||!oldCity)throw new Error('La scheda originale deve avere nome e località per collegare i viaggi.');
    const nextName=normalizeText(after.name),nextCity=normalizeText(after.city);
    if(!nextName||!nextCity)throw new Error('Il cliente aziendale deve avere nome e località.');
    state.trips=state.trips.map(trip=>{
     const first=normalizeText(trip.client)===oldName&&normalizeText(trip.city)===oldCity;
     const second=normalizeText(trip.secondClient)===oldName&&normalizeText(trip.secondCity)===oldCity;
     return first||second?{...trip,
      ...(first?{client:nextName,city:nextCity}:{}),
      ...(second?{secondClient:nextName,secondCity:nextCity}:{}),
      // Preserve fare snapshots, dates, containers, notes and service amounts.
      updatedAt:now}:trip;
    });
   }
  }
 }
 const checked=validateState(state);
 const checkAfter=after?checked[name].find(x=>x.id===key):null;
 return {state:checked,before,after:checkAfter||null,
  affectedTrips:category==='customer'&&updateLinkedTrips?
   linkedCustomerTripCount(raw,original):0};
}
