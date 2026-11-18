/** One container, two delivery customers, one admin-authorized fare.
 * Route order and cities are significant; never derive this price from a driver's private tariff.
 */
import {normalizeText} from './domain.mjs';

const key=(client,city)=>normalizeText(client)+'\u0000'+normalizeText(city);

export function findMultiStopFare(rows,client,city,secondClient,secondCity){
 if(!Array.isArray(rows)||![client,city,secondClient,secondCity].every(x=>typeof x==='string'&&x.trim()))return null;
 const a=key(client,city),b=key(secondClient,secondCity);
 if(a===b)return null;
 return rows.find(row=>row&&row.enabled!==false&&
  key(row.client,row.city)===a&&key(row.secondClient,row.secondCity)===b&&
  Number.isSafeInteger(row.cents)&&row.cents>=0&&row.cents<=99999999)||null;
}
export function singleFareDecision({rows,loaded,client,city,secondClient,secondCity,existing}){
 const pair=loaded?findMultiStopFare(rows,client,city,secondClient,secondCity):null;
 const historical=Boolean(existing&&existing.sumPickupFares===false&&existing.secondCity&&
  key(existing.client,existing.city)===key(client,city)&&
  key(existing.secondClient,existing.secondCity)===key(secondClient,secondCity));
 return {allowed:Boolean(pair)||historical,cents:pair?.cents??(historical?existing.fareCents:null),historical:historical&&!pair,route:pair};
}
