/** Account transport for LTS (opt-in). Tokens stay in this tab's
 * sessionStorage; they never enter IndexedDB, backups, URLs or service workers.
 * Online validation is mandatory before any cached account archive is shown.
 */
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';

const SESSION_KEY='lts-supabase-account-session-v1';
const MODE_KEY='lts-supabase-account-mode-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS=/^[A-Za-z0-9._-]{50,4096}$/;
const REFRESH=/^[A-Za-z0-9._-]{8,4096}$/;
let session=null;
let refreshing=null;
let verified=false;

export function isEnabled(){return runtime.accountAuth?.enabled===true;}
function url(which){
 if(!isEnabled())throw new Error('Accesso autisti non disponibile.');
 const address=runtime.accountAuth?.[which];
 const result=new URL(address);
 if(result.protocol!=='https:'||
     result.hostname!=='otrqynkscpbeyuvdlgpg.supabase.co'||
     result.username||result.password||result.search||result.hash||
     !['/functions/v1/lts-phone-auth','/functions/v1/lts-account-state','/functions/v1/lts-driver-onboarding'].includes(result.pathname))
   throw new Error('Servizio account non configurato in modo sicuro.');
 return result.href;
}
function valid(data){
 return data&&UUID.test(data.user_id||'')&&ACCESS.test(data.access_token||'')&&
   REFRESH.test(data.refresh_token||'')&&Number.isSafeInteger(data.expires_in)&&
   data.expires_in>0&&data.expires_in<=86400&&['admin','driver'].includes(data.role);
}
function readStored(){
 if(session)return session;
 try{
  const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  if(value&&valid(value)&&Number.isFinite(value.expires_at))session=value;
 }catch{}
 return session;
}
function saveSession(data){
 if(!valid(data))throw new Error('Risposta di autenticazione non valida.');
 const next={access_token:data.access_token,refresh_token:data.refresh_token,
   expires_in:data.expires_in,user_id:data.user_id,role:data.role,
   expires_at:Date.now()+data.expires_in*1000};
 if(session&&session.user_id!==next.user_id)throw new Error('Identità account cambiata durante il rinnovo.');
 session=next;verified=false;
 try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch{}
 return next;
}
function locked(){try{return localStorage.getItem(MODE_KEY)==='account';}catch{return false}}
export function hasSession(){return Boolean(readStored());}
// All installations require account authentication, including older device archives.
// Fail closed even if runtime auth configuration is temporarily missing.
export function accountGateRequired(){return true;}
export function isVerified(){return verified&&Boolean(session);}
export function getAccountId(){return session?'account:'+session.user_id:null;}
export function getRole(){return session?.role??null;}
// The legacy device archive stays on IndexedDB for authenticated recovery only.
export function chooseDeviceArchive(){throw new Error('Accesso senza credenziali disattivato. Accedi con il tuo account per recuperare i vecchi viaggi.');}
export function signOut(){
 session=null;verified=false;refreshing=null;
 try{sessionStorage.removeItem(SESSION_KEY);}catch{}
 try{localStorage.setItem(MODE_KEY,'account');}catch{}
}
function revoke(){
 signOut();
 if(typeof window!=='undefined')window.dispatchEvent(new Event('lts-account-locked'));
}
async function api(which,body,bearer=null){
 if(navigator.onLine===false){
   const e=new Error('Connessione assente. I dati salvati sul telefono restano conservati.');
   e.offline=true;throw e;
 }
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  let result;
  try{
   result=await fetch(url(which),{method:'POST',credentials:'omit',redirect:'error',
     mode:'cors',cache:'no-store',signal:controller.signal,
     headers:{Accept:'application/json','Content-Type':'application/json',
       ...(bearer?{Authorization:'Bearer '+bearer}:{})},
     body:JSON.stringify(body)});
  }catch{
   const e=new Error('Connessione con il servizio account non riuscita.');e.offline=true;throw e;
  }
  const type=result.headers.get('content-type')||'';
  if(!type.includes('application/json')){
   const e=new Error('Risposta non valida dal servizio account.');e.status=result.status;throw e;
  }
  let data;
  try{data=await result.json();}catch{
   const e=new Error('Risposta account incompleta.');e.status=result.status;throw e;
  }
  if(!result.ok){
   const e=new Error(typeof data?.error==='string'?data.error:'Operazione account non riuscita.');
   e.status=result.status;throw e;
  }
  return data;
 }finally{clearTimeout(timeout)}
}
async function refresh(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const s=readStored();if(!s)throw new Error('Accedi al tuo account.');
  try{
   const data=await api('loginEndpoint',{action:'refresh',refresh_token:s.refresh_token});
   if(!valid(data)||data.user_id!==s.user_id){revoke();throw new Error('L’identità dell’account non corrisponde.');}
   return saveSession(data);
  }catch(error){
   if([401,403].includes(error.status))revoke();
   throw error;
  }
 })();
 try{return await refreshing;}finally{refreshing=null}
}
export async function login(phone,password){
 if(!isEnabled())throw new Error('Accesso account non abilitato.');
 if(typeof phone!=='string'||phone.length>40||typeof password!=='string'||password.length>256)
   throw new Error('Inserisci numero e password validi.');
 if(readStored())throw new Error('Esci dall’account attuale prima di accedere con un altro.');
 const data=await api('loginEndpoint',{action:'login',phone,password});
 const next=saveSession(data);
 try{
  await verifySession();
  try{localStorage.setItem(MODE_KEY,'account');}catch{}
  return {user_id:next.user_id,role:next.role};
 }catch(error){signOut();throw error}
}
export async function verifySession(){
 const s=readStored();if(!s)throw new Error('Effettua l’accesso con numero e password.');
 if(s.expires_at<Date.now()+15000)await refresh();
 let result;
 try{result=await api('loginEndpoint',{action:'session'},readStored().access_token)}
 catch(error){
  if(error.status===401){
   await refresh();
   result=await api('loginEndpoint',{action:'session'},readStored().access_token);
  }else{if(error.status===403)revoke();throw error}
 }
 if(result?.active!==true||result.user_id!==readStored()?.user_id||
    !['admin','driver'].includes(result.role)){
   revoke();throw new Error('Identità account non verificata.');
 }
 session.role=result.role;verified=true;
 return {user_id:session.user_id,role:result.role};
}
export async function archiveRequest(method,body){
 if(!verified||!readStored())throw new Error('Effettua l’accesso per consultare il registro.');
 const payload=method==='GET'?{action:'read'}:{action:'write',...body};
 let result;
 try{result=await api('archiveEndpoint',payload,readStored().access_token)}
 catch(error){
  if(error.status===401){
   await refresh();
   result=await api('archiveEndpoint',payload,readStored().access_token);
  }else{if(error.status===403)revoke();throw error}
 }
 if(result?.user?.id!=='account:'+readStored()?.user_id||!result.state||
    !Number.isSafeInteger(result.revision)){
   revoke();throw new Error('Il servizio ha restituito un archivio appartenente a un altro account.');
 }
 return result;
}

/** The server independently checks the Supabase JWT, admin role and enabled flag. */
export async function manageDrivers(action, data = {}) {
 if (!isVerified() || getRole() !== 'admin') throw new Error('Accesso riservato all’amministratore.');
 if (!['list', 'issue', 'set-access', 'revoke-invite'].includes(action))
   throw new Error('Operazione non disponibile.');
 const payload = {action, ...data};
 try { return await api('onboardingEndpoint', payload, readStored().access_token); }
 catch (error) {
   if (error.status === 401) {
     await refresh();
     await verifySession();
     if (getRole() !== 'admin') throw new Error('Permesso amministratore non valido.');
     return api('onboardingEndpoint', payload, readStored().access_token);
   }
   if (error.status === 403) revoke();
   throw error;
 }
}
export async function activateDriverInvitation({phone, code, password} = {}) {
 if (!isEnabled()) throw new Error('Attivazione non disponibile.');
 if (hasSession()) throw new Error('Esci dal tuo account prima di attivarne uno nuovo.');
 if (typeof phone !== 'string' || phone.length > 40 ||
     typeof code !== 'string' || code.length > 80 ||
     typeof password !== 'string' || password.length < 12 || password.length > 128)
   throw new Error('Inserisci numero, invito e una password di almeno 12 caratteri.');
 return api('onboardingEndpoint', {action:'redeem', phone, code, password});
}
