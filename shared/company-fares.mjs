/** One company rate for every driver; never read private driver tariffs for a new fare. */
import {normalizeText} from './domain.mjs';

/** Existing journey snapshots remain historical, even when the master rate changes. */
export function companyFareSnapshot(companyRates, loaded, client, city, {unchanged=false, previous=null}={}){
 if(unchanged)return previous??null;
 if(!loaded)return null;
 const name=normalizeText(client),place=normalizeText(city);
 const match=(Array.isArray(companyRates)?companyRates:[]).find(rate=>
  normalizeText(rate.client)===name&&normalizeText(rate.city)===place);
 return Number.isSafeInteger(match?.cents)&&match.cents>=0?match.cents:null;
}
