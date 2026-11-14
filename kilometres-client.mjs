import * as account from './account-access.mjs';
const ENDPOINT='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-kilometres';
/** No disk cache, offline writes or background retries. An ambiguous save reuses its request ID. */
export async function kilometresRequest(action,data={},auth=account) {
 const owner=auth.getAccountId();
 if(!owner||!auth.isVerified())throw Error('Accedi per consultare i chilometri.');
 const token=await auth.getVerifiedAccessToken();
 if(auth.getAccountId()!==owner)throw Error('Account cambiato.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(ENDPOINT,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...data,action})});
  const result=await response.json();
  if(auth.getAccountId()!==owner||!auth.isVerified())throw Error('Account cambiato.');
  if(!response.ok)throw Error(result.error||'Servizio CHILOMETRI non disponibile.');
  if(result.authorized===true&&result.driverId!==owner.slice(8)&&auth.getRole()!=='admin')throw Error('Identità CHILOMETRI non valida.');
  return result;
 }finally{clearTimeout(timer);}
}
export async function kilometresForPdf(month) {
 const result=await kilometresRequest('list',{month});
 if(result.authorized===false)return null;
 if(result.authorized!==true||!Array.isArray(result.entries)||result.month!==month)throw Error('Risposta CHILOMETRI non valida.');
 return result;
}
