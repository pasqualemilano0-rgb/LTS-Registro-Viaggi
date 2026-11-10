/**
 * Adapter for the EXISTING LTS Maps approval endpoint.
 * The general name-only customer proposal is NOT supported by that endpoint.
 * Backend verifies driver/admin permissions and admin MFA; frontend checks are UX only.
 */
import {checkedGoogleMapsUrl} from '../shared/maps-client.mjs';

export function prepareMapsApprovalFromAssistant({url,customer}={}){
 const mapsUrl=checkedGoogleMapsUrl(url).href;
 const name=String(customer?.name??'').trim();
 const city=String(customer?.city??'').trim();
 const address=String(customer?.address??'').trim();
 if(!name||!city||!address||[name,city,address].some(v=>v.length>1000))
  throw new Error('Per inviare la richiesta Maps servono nome, città e indirizzo verificati.');
 return {url:mapsUrl,customer:{name,city,address}};
}
export function mapsApprovalStatus(result){
 if(result?.pending===true&&typeof result.requestId==='string'&&result.requestId)
  return {status:'pending',requestId:result.requestId};
 if(result?.created===true)return {status:'approved_or_created'};
 if(result?.created===false&&result?.customer)return {status:'already_present'};
 throw new Error('Conferma del server non valida.');
}
/**
 * Caller injects the existing authenticated sharedMaps client method.
 * Never submit a fabricated Maps URL or treat a local proposal as sent.
 */
export async function submitExistingMapsApproval(input,{saveSharedMapsCustomer}={}){
 if(typeof saveSharedMapsCustomer!=='function')throw new Error('Servizio richieste LTS non collegato.');
 const {url,customer}=prepareMapsApprovalFromAssistant(input);
 return mapsApprovalStatus(await saveSharedMapsCustomer(url,customer));
}
