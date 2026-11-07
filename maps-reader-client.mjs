/** Authenticated Maps place preview. No client-side scraping, no external redirects,
 * no session tokens in query strings, and no write until the driver confirms details.
 */
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';
import * as account from '/LTS-Registro-Viaggi/account-access.mjs';
import {checkedGoogleMapsUrl} from '/LTS-Registro-Viaggi/shared/maps-client.mjs';

const HOST='otrqynkscpbeyuvdlgpg.supabase.co';
const PATH='/functions/v1/lts-maps-reader';
function endpoint(){
 const configured=runtime.accountAuth?.mapsReaderEndpoint;
 if(typeof configured!=='string')throw new Error('Servizio lettura Google Maps non configurato.');
 const u=new URL(configured);
 if(u.protocol!=='https:'||u.hostname!==HOST||u.pathname!==PATH||
    u.search||u.hash||u.port||u.username||u.password)
  throw new Error('Servizio Google Maps configurato in modo non sicuro.');
 return u.href;
}
export async function readMapsCustomer(link,{signal}={}){
 const source=checkedGoogleMapsUrl(link);
 if(!account.isVerified()||!account.hasSession())
  throw new Error('Accedi a LTS per importare un cliente da Google Maps.');
 const owner=account.getAccountId();
 const token=await account.getVerifiedAccessToken();
 const response=await fetch(endpoint(),{method:'POST',mode:'cors',credentials:'omit',
  redirect:'error',cache:'no-store',signal,
  headers:{Accept:'application/json','Content-Type':'application/json',
   Authorization:'Bearer '+token},
  body:JSON.stringify({url:source.href})});
 if(!(response.headers.get('content-type')||'').includes('application/json'))
  throw new Error('Risposta Google Maps non valida: riprova.');
 const result=await response.json();
 if(owner!==account.getAccountId())throw new Error('Account cambiato durante la lettura.');
 if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:
  'Lettura Google Maps non riuscita. Prova a copiare nuovamente il link.');
 if(!['name','city','address','mapsUrl'].every(key=>typeof result?.[key]==='string')||
    result.mapsUrl!==source.href)
  throw new Error('Dati Google Maps incompleti. Incolla nuovamente il link dalla scheda del luogo.');
 return {name:result.name,city:result.city,address:result.address,
  mapsUrl:source.href,warnings:Array.isArray(result.warnings)?
   result.warnings.filter(s=>typeof s==='string').slice(0,6):[]};
}
