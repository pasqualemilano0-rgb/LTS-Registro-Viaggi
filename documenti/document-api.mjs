/** Shared LTS document transport. No document content is stored in browser caches. */
import * as account from '../account-access.mjs';
const ENDPOINT='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-payroll';
// The unlock credential is an ephemeral in-memory capability. NEVER persist it.
let unlocked=null;
export function hasDeviceUnlock(){
 return account.isVerified()&&account.getRole()==='driver'&&
   Boolean(unlocked?.token&&Date.now()<unlocked.expiresAt);
}
export function clearDeviceUnlock(){unlocked=null;}
export async function lockDocuments(){
 const had=Boolean(unlocked);unlocked=null;
 if(had&&account.hasSession())await request({action:'passkey-lock'});
}
async function request(payload,{multipart=false,pdf=false}={}){
 if(!account.isVerified())throw Error('Verifica prima il tuo account LTS.');
 const token=await account.getVerifiedAccessToken();
 const protectedAction=!multipart&&account.getRole()==='driver'&&
  ['list','download','acknowledge'].includes(payload?.action);
 if(protectedAction&&!hasDeviceUnlock())throw Error('Sblocca I MIEI DOCUMENTI usando il dispositivo.');
 const outbound=protectedAction?{...payload,unlockToken:unlocked.token}:payload;
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),multipart?90000:30000);
 try{
  const response=await fetch(ENDPOINT,{method:'POST',mode:'cors',cache:'no-store',
   credentials:'omit',headers:{Authorization:'Bearer '+token,...(multipart?{}:{'Content-Type':'application/json'})},
   body:multipart?payload:JSON.stringify(outbound),signal:abort.signal});
  if(!response.ok){
   const result=await response.json().catch(()=>({}));
   throw Error(result?.error||'Richiesta documenti non riuscita ('+response.status+').');
  }
  if(pdf){
   if(!(response.headers.get('content-type')||'').startsWith('application/pdf'))
    throw Error('Formato PDF inatteso.');
   const file=await response.blob();
   if(file.size>8388608||file.size<10)throw Error('Documento PDF non valido.');
   return file;
  }
  return response.json();
 }finally{clearTimeout(timer);}
}
export const deviceStatus=()=>request({action:'passkey-status'});
export const registerDeviceOptions=password=>request({action:'passkey-register-options',password});
export const registerDeviceVerify=(challengeId,credential)=>request({
 action:'passkey-register-verify',challengeId,credential
});
export const deviceUnlockOptions=()=>request({action:'passkey-unlock-options'});
export async function deviceUnlockVerify(challengeId,credential){
 const result=await request({action:'passkey-unlock-verify',challengeId,credential});
 if(!/^[A-Za-z0-9_-]{43}$/.test(result?.unlockToken||'')||
   !Number.isInteger(result?.expiresInMs)||result.expiresInMs<30000||result.expiresInMs>180000)
  throw Error('Conferma sblocco non valida.');
 unlocked={token:result.unlockToken,expiresAt:Date.now()+result.expiresInMs-1000};
 return {unlocked:true,expiresInMs:result.expiresInMs};
}
export const documents=filter=>request({action:'list',...filter});
export const drivers=()=>request({action:'drivers'});
export const publish=id=>request({action:'publish',id});
export const upload=(file,{driverId,category,year,month,label})=>{
 if(!(file instanceof File)||file.size>8388608||file.size<10||
    !file.name.toLowerCase().endsWith('.pdf'))throw Error('Seleziona un PDF fino a 8 MB.');
 const form=new FormData();
 for(const [key,value] of Object.entries({driverId,category,year,month:month??'',label}))
  form.set(key,String(value));
 form.set('file',file,file.name);
 return request(form,{multipart:true});
};
export const download=id=>request({action:'download',id},{pdf:true});
export const acknowledge=id=>request({action:'acknowledge',id});
export function savePdf(blob,filename='LTS-documento.pdf'){
 const safe=String(filename).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=safe.endsWith('.pdf')?safe:safe+'.pdf';
 a.rel='noopener';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
