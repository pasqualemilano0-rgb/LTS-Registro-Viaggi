/** Driver-only remembered sign-in: no persistent passwords or access JWTs.
 * Server verification is mandatory before opening any cached account archive.
 */
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';
import {readDriverToken,writeDriverToken,clearDriverToken} from '/LTS-Registro-Viaggi/driver-session-vault.mjs';

const SESSION_KEY='lts-supabase-account-session-v1';
const MODE_KEY='lts-supabase-account-mode-v1';
const MFA_PENDING_KEY='lts-admin-pending-totp-v1';
const MFA_PENDING_MAX_AGE=30*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS=/^[A-Za-z0-9._-]{50,4096}$/;
const REFRESH=/^[A-Za-z0-9._-]{8,4096}$/;
let session=null;
let refreshing=null;
let verified=false;
let restoring=null,generation=0;
let vaultQueue=Promise.resolve();
function enqueueVault(task){
 const result=vaultQueue.catch(()=>{}).then(task);
 vaultQueue=result.catch(()=>{});
 return result;
}
function rememberDriver(data,when=generation){
 if(data.role!=='driver')return Promise.resolve(false);
 return enqueueVault(()=>generation===when?writeDriverToken(data):false);
}
function withRefreshLock(task){
 return navigator.locks?.request?navigator.locks.request('lts-driver-refresh-lock',task):task();
}

export function isEnabled(){return runtime.accountAuth?.enabled===true;}
function url(which){
 if(!isEnabled())throw new Error('Accesso autisti non disponibile.');
 const address=runtime.accountAuth?.[which];
 const result=new URL(address);
 if(result.protocol!=='https:'||
     result.hostname!=='otrqynkscpbeyuvdlgpg.supabase.co'||
     result.username||result.password||result.search||result.hash||
     !['/functions/v1/lts-phone-auth','/functions/v1/lts-account-state','/functions/v1/lts-driver-onboarding','/functions/v1/lts-company-report','/functions/v1/lts-company-tariffs','/functions/v1/lts-admin-records'].includes(result.pathname))
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
export function hasSession(){return Boolean(readStored());}
// All installations require account authentication, including older device archives.
// Fail closed even if runtime auth configuration is temporarily missing.
export function accountGateRequired(){return true;}
export function isVerified(){return verified&&Boolean(session);}
export function getAccountId(){return session?'account:'+session.user_id:null;}
export function getRole(){return session?.role??null;}
/** Persist only the unfinished factor UUID in this tab, never TOTP secret/QR. */
export function rememberPendingAdminMfa(factorId,purpose='primary'){
 const admin=readStored();
 if(!admin||admin.role!=='admin'||!UUID.test(factorId||''))return false;
 try{
  sessionStorage.setItem(MFA_PENDING_KEY,JSON.stringify({
   user_id:admin.user_id,factor_id:factorId,created_at:Date.now(),
   ...(purpose==='backup'?{purpose:'backup'}:{})
  }));return true;
 }catch{return false;}
}
export function forgetPendingAdminMfa(){
 try{sessionStorage.removeItem(MFA_PENDING_KEY);}catch{}
}
export function pendingAdminMfa(){
 const admin=readStored();
 if(!admin||admin.role!=='admin')return null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(MFA_PENDING_KEY)||'null');
  if(saved?.user_id===admin.user_id&&UUID.test(saved.factor_id||'')&&
     Number.isFinite(saved.created_at)&&saved.created_at<=Date.now()&&
     Date.now()-saved.created_at<MFA_PENDING_MAX_AGE)return saved.factor_id;
 }catch{}
 forgetPendingAdminMfa();return null;
}
export function pendingAdminMfaInfo(){
 const factorId=pendingAdminMfa();if(!factorId)return null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(MFA_PENDING_KEY)||'null');
  return {factor_id:factorId,purpose:saved.purpose==='backup'?'backup':'primary'};
 }catch{return null}
}
// The legacy device archive stays on IndexedDB for authenticated recovery only.
export function chooseDeviceArchive(){throw new Error('Accesso senza credenziali disattivato. Accedi con il tuo account per recuperare i vecchi viaggi.');}
export function signOut(){
 generation++;
 session=null;verified=false;refreshing=null;
 try{sessionStorage.removeItem(SESSION_KEY);}catch{}
 forgetPendingAdminMfa();
 try{localStorage.setItem(MODE_KEY,'account');}catch{}
 // A pending token rotation must finish before the durable credential is erased.
 void enqueueVault(()=>clearDriverToken()).catch(()=>{});
}
/** User-initiated logout: clear locally immediately, then revoke this verified
 * session on the backend. Return false for offline/server failure; never pretend
 * that Supabase tokens have been invalidated when the request did not succeed.
 */
export async function logout(){
 const previous=readStored();
 signOut();
 if(!previous)return {revoked:false,noSession:true};
 try{
   const result=await api('loginEndpoint',{action:'logout'},previous.access_token);
   return {revoked:result?.revoked===true,authRefreshRevoked:result?.authRefreshRevoked===true};
 }catch(error){return {revoked:false,offline:Boolean(error.offline),status:error.status||null};}
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
 refreshing=withRefreshLock(async()=>{
  const s=readStored(),when=generation;
  if(!s)throw new Error('Accedi al tuo account.');
  try{
   // Read the newest rotated token under a cross-tab lock (where supported).
   const stored=s.role==='driver'?await readDriverToken().catch(()=>null):null;
   const token=stored?.user_id===s.user_id?stored.refresh_token:s.refresh_token;
   const data=await api('loginEndpoint',{action:'refresh',refresh_token:token});
   if(!valid(data)||data.user_id!==s.user_id||data.role!==s.role){
     revoke();throw new Error('L’identità dell’account non corrisponde.');
   }
   if(when!==generation)throw new Error('Sessione chiusa.');
   const next=saveSession(data);
   if(next.role==='driver')await rememberDriver(next,when).catch(()=>{});
   return next;
  }catch(error){
   if([401,403].includes(error.status))revoke();
   throw error;
  }
 });
 try{return await refreshing;}finally{refreshing=null}
}
/** Restore a previously verified driver only. Admins must log in each time. */
export async function restoreDriverSession(){
 if(readStored())return true;
 if(restoring)return restoring;
 const when=generation;
 restoring=(async()=>{
  const restored=await withRefreshLock(async()=>{
   if(readStored())return true;
   // A sign-out's storage cleanup wins against any pending restoration.
   await vaultQueue.catch(()=>{});
   if(when!==generation)return false;
   const saved=await readDriverToken().catch(()=>null);
   if(!saved)return false;
   try{
    const data=await api('loginEndpoint',{action:'refresh',refresh_token:saved.refresh_token});
    if(!valid(data)||data.user_id!==saved.user_id||data.role!=='driver'){
      revoke();throw new Error('Identità salvata non valida.');
    }
    if(when!==generation)return false;
    const next=saveSession(data);
    await rememberDriver(next,when).catch(()=>{});
    return true;
   }catch(error){
    if([401,403].includes(error.status))revoke();
    throw error; // Offline or temporary failures retain the credential for retry.
   }
  });
  if(restored)await verifySession(); // Online server check before exposing any data.
  return restored;
 })();
 try{return await restoring;}finally{restoring=null}
}
// A revoked account must be locked even when denial follows a token refresh.
// Never treat an HTTP 401 as permission to retry indefinitely.
async function withSessionRetry(request, afterRefresh=null){
 try{return await request();}
 catch(error){
  if(error.status===403){revoke();throw error;}
  if(error.status!==401)throw error;
 }
 try{
  await refresh();
  if(afterRefresh)await afterRefresh();
  return await request();
 }catch(error){
  if([401,403].includes(error.status))revoke();
  throw error;
 }
}

/** These actions are only for the signed-in administrator. TOTP secrets never
 * persist in localStorage, sessionStorage, the user archive or IndexedDB.
 */
export async function enrollAdminTotp(){
 if(!readStored()||getRole()!=='admin')throw new Error('Accesso amministratore necessario.');
 const result=await api('loginEndpoint',{action:'mfa-enroll'},readStored().access_token);
 if(!UUID.test(result.factor_id||'')||typeof result.secret!=='string'||
    typeof result.qr_code!=='string')
   throw new Error('Configurazione autenticatore incompleta.');
 rememberPendingAdminMfa(result.factor_id);
 return {factor_id:result.factor_id,secret:result.secret,qr_code:result.qr_code};
}
/** Only verified factor names/IDs are returned; secrets are never sent. */
export async function listAdminMfaFactors(){
 if(!readStored()||getRole()!=='admin')throw new Error('Accesso amministratore necessario.');
 const result=await api('loginEndpoint',{action:'mfa-factors'},readStored().access_token);
 if(!Array.isArray(result.factors)||result.factors.length>10||
   result.factors.some(x=>!UUID.test(x?.id||'')||typeof x.label!=='string'||x.label.length>100))
   throw new Error('Elenco Authenticator non valido.');
 return result.factors;
}
export async function enrollBackupAdminTotp(){
 if(!readStored()||getRole()!=='admin'||!isVerified())
   throw new Error('Per aggiungere la riserva devi aver verificato il codice principale.');
 const result=await api('loginEndpoint',{action:'mfa-enroll-backup'},readStored().access_token);
 if(!UUID.test(result.factor_id||'')||typeof result.secret!=='string'||
    typeof result.qr_code!=='string'||result.purpose!=='backup')
   throw new Error('Configurazione Authenticator di riserva incompleta.');
 rememberPendingAdminMfa(result.factor_id,'backup');
 return {factor_id:result.factor_id,secret:result.secret,qr_code:result.qr_code};
}
export async function verifyAdminTotp(code,factorId=null){
 if(!readStored()||getRole()!=='admin')throw new Error('Accesso amministratore necessario.');
 if(!/^\d{6}$/.test(code||''))throw new Error('Inserisci il codice a sei cifre.');
 const original=readStored(),when=generation;
 const result=await api('loginEndpoint',{action:'mfa-verify',code,
   ...(factorId?{factor_id:factorId}:{})},original.access_token);
 if(when!==generation)throw new Error('Sessione chiusa durante la verifica.');
 if(!valid(result)||result.role!=='admin'||result.user_id!==original.user_id||
    result.mfa_verified!==true)
   throw new Error('Verifica a due fattori non confermata.');
 saveSession(result);
 const status=await verifySession();
 if(status.mfa_verified!==true||!isVerified())
   throw new Error('La verifica a due fattori non risulta attiva.');
 forgetPendingAdminMfa();
 return status;
}
export async function login(phone,password){
 if(!isEnabled())throw new Error('Accesso account non abilitato.');
 if(typeof phone!=='string'||phone.length>40||typeof password!=='string'||password.length>256)
   throw new Error('Inserisci numero e password validi.');
 // A failed/expired saved session must not prevent its rightful owner from
 // re-authenticating on the login screen. Verify the new password on the server,
 // then accept it only if the identity matches the retained session.
 const previous=readStored();
 const data=await api('loginEndpoint',{action:'login',phone,password});
 if(previous&&(data.user_id!==previous.user_id||data.role!==previous.role)){
  // Another person's credentials never silently replace the owner's cached
  // session or expose their unsynchronized local archive.
  if(typeof data.access_token==='string'){
   try{await api('loginEndpoint',{action:'logout'},data.access_token);}catch{}
  }
  throw new Error('Sul dispositivo è salvato un altro account. Usa “Esci e cambia account”, poi accedi.');
 }
 const next=saveSession(data);
 try{
  const status=await verifySession();
  // Only drivers get a durable device session; not administrative accounts.
  const remembered=next.role==='driver'?await rememberDriver(next).catch(()=>false):false;
  try{localStorage.setItem(MODE_KEY,'account');}catch{}
  return {user_id:next.user_id,role:next.role,remembered,
   mfa_enrolled:status.mfa_enrolled===true,mfa_verified:status.mfa_verified===true};
 }catch(error){signOut();throw error}
}
export async function verifySession(){
 const s=readStored();if(!s)throw new Error('Effettua l’accesso con numero e password.');
 if(s.expires_at<Date.now()+15000)await refresh();
 const result=await withSessionRetry(
  ()=>api('loginEndpoint',{action:'session'},readStored()?.access_token));
 if(result?.active!==true||result.user_id!==readStored()?.user_id||
    !['admin','driver'].includes(result.role)){
   revoke();throw new Error('Identità account non verificata.');
 }
 session.role=result.role;
 const mfaEnrolled=result.role==='admin'&&result.mfa_enrolled===true;
 const mfaVerified=result.role==='admin'&&result.mfa_verified===true;
 verified=!mfaEnrolled||mfaVerified;
 return {user_id:session.user_id,role:result.role,
  mfa_enrolled:mfaEnrolled,mfa_verified:mfaVerified};
}
/** Only an actively revalidated LTS session can authorize a booking lookup.
 * The caller must not persist, log, or pass the bearer token in URL parameters.
 */
export async function getVerifiedAccessToken(){
 await verifySession();
 if(!isVerified())throw new Error('Verifica amministratore necessaria.');
 const current=readStored();
 if(!current?.access_token)throw new Error('Effettua nuovamente l’accesso.');
 return current.access_token;
}
/** Authenticated Realtime channels receive ONLY change hints.
 * Tokens are returned in memory to the socket transport, never to URLs or logs.
 * Expiring tokens are rotated using the existing session checks.
 */
export async function getRealtimeCredentials(){
 const previous=readStored();
 if(!verified||!previous)throw new Error('Sessione LTS non verificata.');
 if(previous.expires_at<Date.now()+90000){
  await refresh();
  await verifySession();
 }
 const current=readStored();
 if(!verified||!current||!['admin','driver'].includes(current.role)||
    !UUID.test(current.user_id||'')||!ACCESS.test(current.access_token||''))
  throw new Error('Sessione Realtime non autorizzata.');
 return {userId:current.user_id,role:current.role,accessToken:current.access_token};
}
export async function archiveRequest(method,body){
 if(!verified||!readStored())throw new Error('Effettua l’accesso per consultare il registro.');
 const payload=method==='GET'?{action:'read'}:{action:'write',...body};
 const result=await withSessionRetry(
  ()=>api('archiveEndpoint',payload,readStored()?.access_token),
  ()=>verifySession());
 if(result?.user?.id!=='account:'+readStored()?.user_id||!result.state||
    !Number.isSafeInteger(result.revision)){
   revoke();throw new Error('Il servizio ha restituito un archivio appartenente a un altro account.');
 }
 return result;
}

/** The server independently checks the Supabase JWT, admin role and enabled flag. */
export async function manageDrivers(action, data = {}) {
 if (!isVerified() || getRole() !== 'admin') throw new Error('Accesso riservato all’amministratore.');
 if (!['list', 'issue', 'set-access', 'revoke-invite', 'remove-pending', 'remove-activated', 'reinsert-activated', 'issue-reset', 'revoke-reset', 'revoke-sessions'].includes(action))
   throw new Error('Operazione non disponibile.');
 const payload = {action, ...data};
 return withSessionRetry(
  ()=>api('onboardingEndpoint',payload,readStored()?.access_token),
  async()=>{
   await verifySession();
   if(getRole()!=='admin')throw new Error('Permesso amministratore non valido.');
  });
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

/** Driver password recovery uses the existing administrator-issued, one-use
 * credential reset. The server maps phone + reset code to the original Auth
 * user; the personal archive remains bound to the same user_id.
 * Never send passwords or tokens to the administrator or store them locally. */
export async function recoverDriverPassword({phone,code,password}={}){
 if(hasSession())throw new Error('Sessione precedente presente: scegli Esci e cambia account nella schermata di accesso, poi ripeti il recupero.');
 if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code))
   throw new Error('Inserisci il codice monouso completo ricevuto dall’amministratore.');
 return activateDriverInvitation({phone,code,password});
}

/** Admin-only statistical view; backend also validates role, JWT, live session and MFA. */
export async function companyReport({month,offset=0,limit=40,driverId=null}={}){
 if(!isVerified()||getRole()!=='admin')throw new Error('Accesso amministratore richiesto.');
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||
    !Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>40)
   throw new Error('Filtri report non validi.');
 const payload={action:'overview',month,offset,limit,...(driverId?{driverId}:{})};
 return withSessionRetry(
  ()=>api('reportEndpoint',payload,readStored()?.access_token),
  async()=>{await verifySession();if(getRole()!=='admin')throw new Error('Ruolo non autorizzato.');});
}


/** Advanced admin-only read-only insights; same verified session and MFA-secured endpoint. */
export async function companyInsights({month,driverId=null,compareDriverId=null,fromDate=null,toDate=null,
 client='',city='',container=''}={}){
 if(!isVerified()||getRole()!=='admin')throw new Error('Accesso amministratore richiesto.');
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
  throw new Error('Mese non valido.');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if((driverId&&!UUID.test(driverId))||(compareDriverId&&!UUID.test(compareDriverId))||
    (driverId&&driverId===compareDriverId))
  throw new Error('Selezione autisti non valida.');
 for(const value of [fromDate,toDate])if(value!==null&&
  (typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)))throw new Error('Data non valida.');
 for(const value of [client,city,container])if(typeof value!=='string'||value.length>100)
  throw new Error('Filtro non valido.');
 const payload={action:'insights',month,...(driverId?{driverId}:{}),
  ...(compareDriverId?{compareDriverId}:{}),
  ...(fromDate?{fromDate}:{}),...(toDate?{toDate}:{}),
  ...(client?{client}:{}),...(city?{city}:{}),...(container?{container}:{})};
 return withSessionRetry(
  ()=>api('reportEndpoint',payload,readStored()?.access_token),
  async()=>{await verifySession();if(getRole()!=='admin')throw new Error('Ruolo non autorizzato.');});
}

/** Admin-only central base tariffs, protected again by the backend MFA/session checks. */
export async function companyTariffs(action='list',data={}){
 if(!isVerified()||getRole()!=='admin')throw new Error('Accesso amministratore richiesto.');
 if(!['list','save','extra-save'].includes(action))throw new Error('Operazione tariffa non valida.');
 const payload={action,...data};
 return withSessionRetry(
  ()=>api('tariffsEndpoint',payload,readStored()?.access_token),
  async()=>{await verifySession();if(getRole()!=='admin')throw new Error('Ruolo amministratore non valido.');});
}

/** Read-only company catalog for every verified driver or administrator.
 * The server independently authorizes the active JWT/session; no personal
 * archives are exposed and only the admin can write these prices. */
export async function driverCompanyTariffs(){
 if(!isVerified()||!hasSession())throw new Error('Accedi per consultare il tariffario aziendale.');
 const result=await withSessionRetry(
  ()=>api('tariffsEndpoint',{action:'list'},readStored()?.access_token),
  ()=>verifySession());
 if(!Array.isArray(result?.tariffs)||result.tariffs.length>500||
   result.tariffs.some(row=>typeof row?.client!=='string'||typeof row?.city!=='string'||
   !Number.isSafeInteger(row?.cents)||row.cents<0||row.cents>99999999||
   typeof row?.id!=='string'))
  throw new Error('Tariffario aziendale incompleto. Riprova.');
 return result.tariffs;
}

/** Company fares and the eight shared extra rates are fetched atomically
 * from the same authenticated server response. Never fall back to private
 * historic rate entries when a shared price is unavailable. */
export async function driverCompanyCatalog(){
 if(!isVerified()||!hasSession())throw new Error('Accedi per consultare il tariffario aziendale.');
 const result=await withSessionRetry(
  ()=>api('tariffsEndpoint',{action:'list'},readStored()?.access_token),
  ()=>verifySession());
 if(!Array.isArray(result?.tariffs)||result.tariffs.length>500||
   result.tariffs.some(row=>typeof row?.client!=='string'||typeof row?.city!=='string'||
   !Number.isSafeInteger(row?.cents)||row.cents<0||row.cents>99999999||
   typeof row?.id!=='string'))
  throw new Error('Tariffario trasferte aziendale non valido.');
 const extras=result?.extraRates;
 const expected=new Set(['facchinaggioBilico','facchinaggioReefer','reefer','adr',
  'pernotto','sabatoPorto','sabatoTrasferta','preOrario']);
 if(!Array.isArray(extras)||extras.length!==expected.size||
   extras.some(row=>!expected.delete(row?.serviceKey)||
    !(row.cents===null||(Number.isSafeInteger(row.cents)&&row.cents>=0&&row.cents<=99999999))||
    !Number.isSafeInteger(row.revision)||row.revision<1))
  throw new Error('Tariffario servizi extra aziendale incompleto.');
 return {tariffs:result.tariffs,extraRates:extras};
}

/** Administrator-only per-driver personal records. On the server:
 * active Auth JWT, live session, MFA, role and revision are rechecked.
 * This path does not grant driver accounts any cross-account access. */
export async function adminRecords(action,data={}){
 if(!isVerified()||getRole()!=='admin')
  throw new Error('Accesso amministratore con Authenticator richiesto.');
 if(!['list','read','mutate'].includes(action))
  throw new Error('Operazione amministrativa non consentita.');
 if(data===null||typeof data!=='object'||Array.isArray(data))
  throw new Error('Dati richiesta non validi.');
 return withSessionRetry(
  ()=>api('adminRecordsEndpoint',{action,...data},readStored()?.access_token),
  async()=>{await verifySession();if(getRole()!=='admin')
   throw new Error('Permesso amministratore non confermato.');});
}
