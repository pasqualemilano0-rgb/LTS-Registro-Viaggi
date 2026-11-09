/** Pure, read-only browsing helpers for the driver's monthly register.
 * No writes, no re-pricing of stored snapshots, and no account identifiers. */
import {tripAmounts,SERVICES} from './domain.mjs';

export const REGISTER_PAGE_SIZE=24;
export const REGISTER_FILTERS=Object.freeze(['all','unpriced','second','extras']);

const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleUpperCase('it-IT').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const compact=value=>normalize(value).replace(/\s+/gu,'');

function matchesText(trip,query){
 const tokens=normalize(query).slice(0,120).split(' ').filter(Boolean);
 if(!tokens.length)return true;
 const date=String(trip.date||'');
 const european=/^\d{4}-\d{2}-\d{2}$/u.test(date)?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):date;
 const labels=(Array.isArray(trip.services)?trip.services:[])
  .map(key=>SERVICES.find(service=>service.key===key)?.label||key);
 const fields=[date,european,trip.container,compact(trip.container),trip.client,trip.city,
  trip.secondClient,trip.secondCity,trip.note,...labels];
 const haystack=' '+normalize(fields.join(' '))+' ';
 const condensed=compact(fields.join(' '));
 return tokens.every(token=>haystack.includes(token)||condensed.includes(compact(token)));
}

export function registerTripCounts(trips,amountContext){
 const result={all:0,unpriced:0,second:0,extras:0};
 for(const trip of trips){
  result.all++;
  if(tripAmounts(trip,amountContext).missingTariff)result.unpriced++;
  if(Boolean(trip.secondCity))result.second++;
  if(Array.isArray(trip.services)&&trip.services.length)result.extras++;
 }
 return result;
}

export function filterRegisterTrips(trips,{query='',filter='all',amountContext=null}={}){
 if(!REGISTER_FILTERS.includes(filter))throw new Error('Filtro registro non valido.');
 if(!Array.isArray(trips))throw new Error('Elenco viaggi non valido.');
 return trips.filter(trip=>{
  if(filter==='unpriced'&&!tripAmounts(trip,amountContext).missingTariff)return false;
  if(filter==='second'&&!trip.secondCity)return false;
  if(filter==='extras'&&!(Array.isArray(trip.services)&&trip.services.length))return false;
  return matchesText(trip,query);
 });
}

export function paginateRegisterTrips(trips,limit=REGISTER_PAGE_SIZE){
 if(!Array.isArray(trips))throw new Error('Elenco viaggi non valido.');
 const safe=Math.max(REGISTER_PAGE_SIZE,Math.min(10000,Number.isFinite(limit)?Math.floor(limit):REGISTER_PAGE_SIZE));
 return {visible:trips.slice(0,safe),total:trips.length,hasMore:trips.length>safe};
}

export function stepRegisterMonth(month,delta){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month))
  throw new Error('Mese del registro non valido.');
 if(!Number.isInteger(delta)||Math.abs(delta)>12)throw new Error('Spostamento mensile non valido.');
 const serial=Number(month.slice(0,4))*12+Number(month.slice(5))-1+delta;
 if(serial<1900*12||serial>2199*12+11)return month;
 return String(Math.floor(serial/12)).padStart(4,'0')+'-'+String(serial%12+1).padStart(2,'0');
}
