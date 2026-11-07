import { trustedClientIp } from './client-ip.mjs';
import { checkLtsSession } from './lts-session.mjs';
import { requireAdminMfa } from './lts-admin-mfa.mjs';

// Strict same-origin browser access. Origin is a CSRF boundary, NOT the
// administrator credential: every privileged action verifies Supabase Auth.
export const LTS_ORIGIN = 'https://pasqualemilano0-rgb.github.io';
const CODE = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const EMAIL_DOMAIN = 'example.com'; // IANA-reserved example domain; no email is sent
export const PASSWORD_MIN = 12;
const MAX_BODY = 8192;
const MAX_DRIVERS = 200;
const MAX_HISTORY = 4000;
const INVITE_MS = 24 * 60 * 60 * 1000;

export function normalizedPhone(input) {
  if (typeof input !== 'string' || input.length > 40) return null;
  let value = input.trim().replace(/[\s().-]+/g, '');
  if (value.startsWith('00')) value = '+' + value.slice(2);
  if (/^3\d{9}$/.test(value)) value = '+39' + value;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}
function normalName(value) {
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\s+/g, ' ');
  if (result.length < 1 || result.length > 80 || /[\u0000-\u001f\u007f]/.test(result)) return null;
  return result;
}
export function strongPassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= 128
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
    && /[A-Za-z]/.test(value) && /\d/.test(value);
}
function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': LTS_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, private, max-age=0',
    'Pragma': 'no-cache',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
function json(body,status=200) { return new Response(JSON.stringify(body),{status,headers:publicHeaders()}); }
export async function digest(value) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
// Have I Been Pwned Pwned Passwords range API: only the first five SHA-1
// hex digits leave this Edge Function; never send or log a password or full hash.
// SHA-1 is used ONLY for the lookup protocol. Supabase Auth stores bcrypt hashes.
export async function isExposedPassword(password,{fetchImpl=fetch}={}) {
  const buffer=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
  const sha1=Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0'))
    .join('').toUpperCase();
  const prefix=sha1.slice(0,5),suffix=sha1.slice(5);
  const response=await fetchImpl('https://api.pwnedpasswords.com/range/'+prefix,{
    method:'GET',headers:{'Add-Padding':'true','Accept':'text/plain'},
    cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
    signal:AbortSignal.timeout(4500)
  });
  if(!response || response.status!==200)throw new Error('breach-service-unavailable');
  const data=await response.text();
  if(typeof data!=='string'||data.length===0||data.length>350000)
    throw new Error('breach-service-malformed');
  let seen=0;
  for(const line of data.trim().split(/\r?\n/)) {
    const match=/^([0-9A-F]{35}):([0-9]{1,10})$/i.exec(line.trim());
    if(!match)throw new Error('breach-service-malformed');
    seen++;
    if(match[1].toUpperCase()===suffix && Number(match[2])>0)return true;
  }
  if(seen===0)throw new Error('breach-service-malformed');
  return false;
}

const genericInviteError=()=>json({error:'Invito non valido o scaduto. Chiedi un nuovo invito all’amministratore.'},400);
async function limit(admin,label,subject,max) {
  const hash=await digest('lts-onboard-v1:'+label+':'+subject);
  const {data,error}=await admin.rpc('lts_auth_take_attempt',
    {p_subject_hash:hash,p_max_attempts:max,p_window_seconds:900});
  if (error) throw new Error('rate-store-unavailable');
  return data === true;
}
async function getAdmin(request,publicClient,admin,checkSession,checkMfa) {
  const match=/^Bearer ([A-Za-z0-9._-]{50,4096})$/.exec(request.headers.get('authorization')||'');
  if (!match) return {error:json({error:'Accesso amministratore richiesto.'},401)};
  const {data,error}=await publicClient.auth.getUser(match[1]);
  if(error||!data?.user?.id)return {error:json({error:'Sessione scaduta o non valida.'},401)};
  const {data:entry,error:lookupError}=await admin.from('lts_account_access')
    .select('role,enabled,user_id').eq('user_id',data.user.id).maybeSingle();
  if(lookupError)return {error:json({error:'Servizio temporaneamente non disponibile.'},503)};
  if(!entry?.enabled || entry.role!=='admin')return {error:json({error:'Operazione riservata all’amministratore.'},403)};
  try { await checkSession(admin,match[1],data.user.id); }
  catch(error){return {error:json({error:'Sessione amministratore scaduta o revocata.'},
    error?.status===503?503:error?.status===401?401:403)};}
  try{await checkMfa(admin,match[1],data.user.id);}
  catch(error){
    const needsMfa=error?.status===428;
    return {error:json({error:needsMfa?'Conferma il codice a due fattori per gestire gli autisti.':'Verifica MFA non disponibile.'},needsMfa?428:503)};
  }
  return {userId:data.user.id};
}
async function recentInvites(admin,phone) {
  const {data,error}=await admin.from('lts_driver_invites')
    .select('phone_e164,issued_at,expires_at,claimed_at,completed_at,revoked_at')
    .eq('phone_e164',phone).order('issued_at',{ascending:false}).limit(20);
  if(error)throw new Error('invite-store-unavailable');
  return data||[];
}
async function listDrivers(admin) {
  const [pending,accounts,invites,resets]=await Promise.all([
    admin.from('lts_pending_drivers')
      .select('phone_e164,first_name,last_name,completed_at,auth_user_id')
      .is('removed_at',null).order('created_at',{ascending:false}).limit(MAX_DRIVERS+1),
    admin.from('lts_account_access')
      .select('phone_e164,user_id,role,enabled,removed_at').eq('role','driver').limit(MAX_DRIVERS+1),
    admin.from('lts_driver_invites')
      .select('phone_e164,issued_at,expires_at,claimed_at,completed_at,revoked_at')
      .order('issued_at',{ascending:false}).limit(MAX_HISTORY+1),
    admin.from('lts_driver_credential_resets')
      .select('phone_e164,issued_at,expires_at,claimed_at,completed_at,revoked_at')
      .order('issued_at',{ascending:false}).limit(MAX_HISTORY+1)
  ]);
  if(pending.error||accounts.error||invites.error||resets.error)throw new Error('list-unavailable');
  // Never silently misreport invitations/reset states when history truncates.
  if([pending.data,accounts.data].some(rows=>rows?.length>MAX_DRIVERS)||
    [invites.data,resets.data].some(rows=>rows?.length>MAX_HISTORY))
    return json({error:'Troppi autisti o eventi storici per questa pagina. Contatta l’assistenza per la paginazione.'},503);
  // Removed activated accounts retain their UID and archive, but are not in the active roster.
  const byPhone=new Map((accounts.data||[]).filter(a=>!a.removed_at).map(a=>[a.phone_e164,a]));
  const lastByPhone=new Map();
  for(const item of invites.data||[]){
    const current=lastByPhone.get(item.phone_e164);
    // Two independently issued invitations can share a millisecond timestamp.
    // At equal issuance time prefer the still-valid replacement over a revoked code.
    if(!current || item.issued_at>current.issued_at
      || (item.issued_at===current.issued_at && current.revoked_at && !item.revoked_at))
      lastByPhone.set(item.phone_e164,item);
  }
  const resetByPhone=new Map();
  for(const item of resets.data||[]){
    const current=resetByPhone.get(item.phone_e164);
    if(!current || item.issued_at>current.issued_at ||
      (item.issued_at===current.issued_at && current.revoked_at && !item.revoked_at))
      resetByPhone.set(item.phone_e164,item);
  }
  const resetInProgress=phone=>{
    const reset=resetByPhone.get(phone);
    return Boolean(reset&&!reset.revoked_at&&!reset.completed_at &&
      new Date(reset.expires_at).getTime()>Date.now());
  };
  const rows=(pending.data||[]).map(p=>{
    const account=byPhone.get(p.phone_e164),inv=lastByPhone.get(p.phone_e164);
    let status=account?(account.enabled?'active':resetInProgress(p.phone_e164)?'resetting':'disabled'):'pending';
    if(!account&&inv){
      if(inv.completed_at)status='completed';
      else if(inv.revoked_at)status='revoked';
      else if(inv.claimed_at)status='processing';
      else if(new Date(inv.expires_at).getTime()<=Date.now())status='expired';
      else status='invited';
    }
    return {phone:p.phone_e164,firstName:p.first_name,lastName:p.last_name,
      status,expiresAt:status==='invited'?inv.expires_at:null};
  });
  // A legacy driver may already have an account directory entry without pending row.
  for(const [phone,account] of byPhone)if(!rows.some(row=>row.phone===phone))
    rows.push({phone,firstName:'',lastName:'',status:account.enabled?'active':resetInProgress(phone)?'resetting':'disabled',expiresAt:null});
  return json({drivers:rows});
}
async function issueInvite(admin,adminId,body,now,bytes) {
  const phone=normalizedPhone(body.phone),firstName=normalName(body.firstName),lastName=normalName(body.lastName);
  if(!phone||!firstName||!lastName)return json({error:'Nome, cognome o numero di telefono non validi.'},400);
  if(!await limit(admin,'admin-invites',adminId,20))return json({error:'Troppe richieste. Riprova più tardi.'},429);
  const existing=await admin.from('lts_account_access').select('user_id,removed_at').eq('phone_e164',phone).maybeSingle();
  if(existing.error)throw new Error('directory-unavailable');
  if(existing.data)return json({error:existing.data.removed_at
    ?'Numero già associato a un account rimosso: usa Reinserisci account rimosso, senza generare un nuovo utente.'
    :'Questo numero è già associato a un account. Usa Gestisci accessi.'},409);
  const {data:pending,error:pendingError}=await admin.from('lts_pending_drivers')
    .select('completed_at,auth_user_id,removed_at').eq('phone_e164',phone).maybeSingle();
  if(pendingError)throw new Error('pending-unavailable');
  if(pending?.completed_at||pending?.auth_user_id)
    return json({error:'Questa approvazione risulta già completata: controlla l’account.'},409);
  // A redemption currently in progress cannot be silently superseded.
  const previous=await recentInvites(admin,phone);
  if(previous.some(i=>i.claimed_at&&!i.completed_at&&!i.revoked_at&&new Date(i.expires_at).getTime()>now()))
    return json({error:'Attivazione già in corso. Verifica prima lo stato dell’autista.'},409);
  if(pending){
    const updated=await admin.from('lts_pending_drivers').update({first_name:firstName,last_name:lastName,removed_at:null})
      .eq('phone_e164',phone).is('completed_at',null).is('auth_user_id',null);
    if(updated.error)throw new Error('pending-update-failed');
  }else{
    const inserted=await admin.from('lts_pending_drivers')
      .insert({phone_e164:phone,first_name:firstName,last_name:lastName});
    if(inserted.error)return json({error:'Impossibile registrare l’autista. Controlla eventuali duplicati.'},409);
  }
  const revoked=await admin.from('lts_driver_invites').update({revoked_at:new Date(now()).toISOString()})
    .eq('phone_e164',phone).is('claimed_at',null).is('revoked_at',null);
  if(revoked.error)throw new Error('revoke-prior-failed');
  const raw=bytes();
  if(!(raw instanceof Uint8Array)||raw.length!==32)throw new Error('entropy-unavailable');
  const code=btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const token_hash=await digest('lts-invite-v1:'+code);
  const expiresAt=new Date(now()+INVITE_MS).toISOString();
  const added=await admin.from('lts_driver_invites').insert({
    phone_e164:phone,token_hash,issued_by:adminId,
    issued_at:new Date(now()).toISOString(),expires_at:expiresAt
  });
  if(added.error)throw new Error('invite-insert-failed');
  // Only response containing the raw invitation; never persisted in Postgres.
  return json({ok:true,phone,firstName,lastName,code,expiresAt},201);
}
// An activated driver must keep the same Auth ID and archive. Issue a distinct
// one-time credential-recovery code rather than deleting/recreating the user.
async function issueReset(admin,adminId,body,now,bytes) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  if(!await limit(admin,'admin-resets',adminId,12))return json({error:'Troppi ripristini. Riprova più tardi.'},429);
  const {data:account,error:lookupError}=await admin.from('lts_account_access')
    .select('user_id,role,removed_at').eq('phone_e164',phone).maybeSingle();
  if(lookupError)throw new Error('directory-unavailable');
  if(!account||account.role!=='driver')
    return json({error:'Account autista non trovato. Usa Genera invito per un nuovo autista.'},404);
  if(account.removed_at)return json({error:'L’autista è stato rimosso. Reinseriscilo prima di ripristinare le credenziali.'},409);
  const previous=await admin.from('lts_driver_credential_resets')
    .select('claimed_at,completed_at,revoked_at,expires_at').eq('phone_e164',phone)
    .order('issued_at',{ascending:false}).limit(10);
  if(previous.error)throw new Error('reset-store-unavailable');
  if((previous.data||[]).some(r=>r.claimed_at&&!r.completed_at&&!r.revoked_at&&new Date(r.expires_at).getTime()>now()))
    return json({error:'Ripristino in elaborazione. Attendi o annulla prima il codice precedente.'},409);
  const raw=bytes();
  if(!(raw instanceof Uint8Array)||raw.length!==32)throw new Error('entropy-unavailable');
  const code=btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const tokenHash=await digest('lts-reset-v1:'+code);
  const expiresAt=new Date(now()+INVITE_MS).toISOString();
  const started=await admin.rpc('lts_start_driver_credential_reset',{
    p_phone:phone,p_admin_id:adminId,p_token_hash:tokenHash,p_expires_at:expiresAt
  });
  if(started.error)throw new Error('reset-start-failed');
  if(started.data!==true)return json({error:'Account non disponibile per il ripristino. Aggiorna l’elenco.'},409);
  return json({ok:true,mode:'reset',phone,code,expiresAt,
    message:'Accesso sospeso fino alla scelta della nuova password; i viaggi sono conservati.'},201);
}
async function revokeReset(admin,body) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  const changed=await admin.from('lts_driver_credential_resets')
    .update({revoked_at:new Date().toISOString()}).eq('phone_e164',phone)
    .is('completed_at',null).is('revoked_at',null)
    .gt('expires_at',new Date().toISOString()).select('id');
  if(changed.error)throw new Error('reset-revoke-failed');
  if(!Array.isArray(changed.data)||changed.data.length===0)
    return json({error:'Nessun ripristino ancora annullabile. Aggiorna l’elenco autisti.'},409);
  return json({ok:true,revoked:changed.data.length,
    message:'Codici annullati. L’account rimane disattivato finché non viene riattivato.'});
}

async function setAccess(admin,body) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  if(typeof body.enabled!=='boolean')return json({error:'Stato accesso non valido.'},400);
  if(body.enabled){
    const pending=await admin.from('lts_driver_credential_resets')
      .select('id').eq('phone_e164',phone).is('completed_at',null)
      .is('revoked_at',null).gt('expires_at',new Date().toISOString()).limit(1);
    if(pending.error)throw new Error('reset-store-unavailable');
    if((pending.data||[]).length)return json({error:'Completa o annulla il ripristino credenziali prima di riattivare il login.'},409);
  }
  const changed=await admin.from('lts_account_access')
    .update({enabled:body.enabled}).eq('phone_e164',phone).eq('role','driver').is('removed_at',null)
    .select('user_id,enabled').maybeSingle();
  if(changed.error)throw new Error('access-update-failed');
  if(!changed.data)return json({error:'Autista non trovato. L’account amministratore non può essere modificato.'},404);
  // Every login, refresh and account-state access independently checks enabled.
  return json({ok:true,enabled:changed.data.enabled});
}
async function revokeDriverSessions(admin,body){
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  const {data,error}=await admin.rpc('lts_revoke_all_driver_sessions',{p_phone:phone});
  if(error)throw new Error('revoke-sessions-failed');
  if(data!==true)return json({error:'Autista attivato non trovato.'},404);
  return json({ok:true,revoked:true,message:'Dispositivi scollegati: servono nuove credenziali di accesso. Viaggi conservati.'});
}
async function revokeInvite(admin,body) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  const changed=await admin.from('lts_driver_invites').update({revoked_at:new Date().toISOString()})
    .eq('phone_e164',phone).is('completed_at',null).is('revoked_at',null)
    .gt('expires_at',new Date().toISOString()).select('id');
  if(changed.error)throw new Error('invite-revoke-failed');
  if(!Array.isArray(changed.data)||changed.data.length===0)
    return json({error:'Invito già utilizzato o annullato. Aggiorna l’elenco autisti.'},409);
  return json({ok:true,revoked:changed.data.length});
}
// Soft-remove a never-activated driver. The RPC locks the approval row before
// revoking invitation tokens, preventing a concurrent activation from winning.
async function removePending(admin,body) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  const {data:account,error:lookupError}=await admin.from('lts_account_access')
    .select('user_id,role').eq('phone_e164',phone).maybeSingle();
  if(lookupError)throw new Error('directory-unavailable');
  if(account)return json({error:'Account già attivato: per conservare i viaggi usa Disattiva o Riattiva. Non eliminare le credenziali.'},409);
  const result=await admin.rpc('lts_remove_unactivated_driver',{p_phone:phone});
  if(result.error)throw new Error('pending-removal-failed');
  if(result.data!==true)return json({error:'Autista non trovato o attivazione già completata. Aggiorna l’elenco.'},409);
  return json({ok:true,removed:true});
}
// Both operations are atomic service_role RPCs. No Auth user or archive is deleted.
async function removeActivated(admin,body) {
  const phone=normalizedPhone(body.phone);
  if(!phone)return json({error:'Numero di telefono non valido.'},400);
  const result=await admin.rpc('lts_remove_activated_driver',{p_phone:phone});
  if(result.error)throw new Error('activated-removal-failed');
  if(result.data!==true)return json({error:'Autista attivo non trovato o già rimosso. Aggiorna l’elenco.'},409);
  return json({ok:true,removed:true});
}
async function reinsertActivated(admin,body) {
  const phone=normalizedPhone(body.phone);
  const firstName=normalName(body.firstName),lastName=normalName(body.lastName);
  if(!phone||!firstName||!lastName)return json({error:'Nome, cognome o cellulare non validi.'},400);
  const result=await admin.rpc('lts_reinstate_activated_driver',{
    p_phone:phone,p_first_name:firstName,p_last_name:lastName
  });
  if(result.error)throw new Error('activated-reinstate-failed');
  if(result.data!==true)return json({error:'Nessun account rimosso per questo numero oppure ripristino credenziali in corso.'},409);
  return json({ok:true,restored:true,phone,message:'Autista reinserito: lo stesso account e i suoi viaggi sono conservati.'});
}
async function redeem(admin,body,clientIp,now,uuid,passwordExposed) {
  const phone=normalizedPhone(body.phone),code=body.code,password=body.password;
  if(!phone||typeof code!=='string'||!CODE.test(code))return genericInviteError();
  if(!strongPassword(password))return json({
    error:'La password deve avere 12–128 caratteri, con almeno una lettera e un numero.'},400);
  if(!await limit(admin,'redeem-ip',clientIp,30)||
     !await limit(admin,'redeem-phone',phone,6))
     return json({error:'Troppi tentativi di attivazione. Riprova fra 15 minuti.'},429);
  // Do not consume a valid invite if the breach checker is unavailable.
  // This occurs after existing rate limits, before the atomic claim.
  let exposed;
  try { exposed=await passwordExposed(password); }
  catch {return json({error:'Controllo di sicurezza password non disponibile. Riprova più tardi.'},503);}
  if(exposed!==false && exposed!==true)
    return json({error:'Controllo di sicurezza password non disponibile. Riprova più tardi.'},503);
  if(exposed)return json({error:'Password già presente in violazioni note. Scegline una diversa.'},400);
  const tokenHash=await digest('lts-invite-v1:'+code);
  const claim=await admin.from('lts_driver_invites')
    .update({claimed_at:new Date(now()).toISOString()})
    .eq('phone_e164',phone).eq('token_hash',tokenHash).is('claimed_at',null)
    .is('revoked_at',null).gt('expires_at',new Date(now()).toISOString())
    .select('phone_e164').maybeSingle();
  if(claim.error)throw new Error('invitation-claim-failed');
  if(!claim.data){
    // An existing driver uses the same activation screen, but recovers the
    // password for the existing user_id; no new Auth account is created.
    const resetHash=await digest('lts-reset-v1:'+code);
    const claimed=await admin.rpc('lts_claim_driver_credential_reset',
      {p_phone:phone,p_token_hash:resetHash});
    if(claimed.error)throw new Error('reset-claim-failed');
    const owner=claimed.data;
    if(!owner||typeof owner!=='string'||!UUID.test(owner))return genericInviteError();
    try{
      const updated=await admin.auth.admin.updateUserById(owner,{password});
      if(updated.error||updated.data?.user?.id!==owner)throw new Error('reset-auth-failed');
      const done=await admin.rpc('lts_finish_driver_credential_reset',
        {p_token_hash:resetHash,p_user_id:owner});
      if(done.error||done.data!==true)throw new Error('reset-finish-failed');
      return json({ok:true,message:'Credenziali ripristinate. Accedi con il numero e la nuova password. Il registro è conservato.'},201);
    }catch{
      // Stay disabled, with the existing account and archives untouched.
      // Never delete the old Auth user; a new admin reset may be required.
      return json({error:'Ripristino non completato. L’account rimane disattivato: chiedi un nuovo codice all’amministratore.'},503);
    }
  }
  const alias='lts-'+uuid()+'@'+EMAIL_DOMAIN;
  let newUser=null;
  try{
    // A managed, non-routable alias preserves the existing server-side
    // phone -> email login mapping without claiming phone/SMS verification.
    // Supabase Auth alone hashes the password.
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email:alias,password,email_confirm:true,app_metadata:{lts_role:'driver'}
    });
    if(createError||!created?.user?.id)throw new Error('user-creation-failed');
    newUser=created.user.id;
    const result=await admin.rpc('lts_finish_driver_invite',
      {p_token_hash:tokenHash,p_user_id:newUser});
    if(result.error||result.data!==true)throw new Error('finish-failed');
    return json({ok:true,message:'Attivazione completata. Ora accedi con il tuo numero e la password.'},201);
  }catch{
    if(newUser){
      // A DB failure cannot leave an unauthorized account with LTS privileges.
      // Inspect completion before cleanup in case the RPC response was lost.
      let completed=false;
      try{
        const check=await admin.from('lts_driver_invites')
          .select('activated_user_id,completed_at').eq('token_hash',tokenHash).maybeSingle();
        completed=check.data?.activated_user_id===newUser&&Boolean(check.data?.completed_at);
      }catch{}
      if(completed)return json({ok:true,message:'Attivazione completata. Ora accedi.'},201);
      try{await admin.auth.admin.deleteUser(newUser)}catch{}
    }
    // Token intentionally remains consumed after a failed attempt to avoid reuse.
    return json({error:'Attivazione non completata. Richiedi un nuovo invito all’amministratore.'},503);
  }
}

export function createOnboardingHandler({getClients,clock=Date.now,randomBytes=()=>crypto.getRandomValues(new Uint8Array(32)),
  randomUUID=()=>crypto.randomUUID(),passwordExposed=isExposedPassword,
  checkSession=checkLtsSession,checkMfa=requireAdminMfa}={}){
  return async function handle(request){
    const origin=request.headers.get('origin');
    // Required even for CLI clients; forged Origin grants no privileged access.
    if(origin!==LTS_ORIGIN)return json({error:'Origine non consentita.'},403);
    if(request.method==='OPTIONS'){
      const requested=(request.headers.get('access-control-request-headers')||'')
        .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      if(request.headers.get('access-control-request-method')!=='POST'||
         requested.some(h=>!['content-type','authorization'].includes(h)))
        return json({error:'Preflight non consentito.'},403);
      return new Response(null,{status:204,headers:publicHeaders()});
    }
    if(request.method!=='POST')return json({error:'Metodo non consentito.'},405);
    if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
      return json({error:'Formato JSON necessario.'},415);
    const length=request.headers.get('content-length');
    if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY))
      return json({error:'Richiesta troppo grande.'},413);
    const ip=trustedClientIp(request.headers);
    if(!ip)return json({error:'Gateway di sicurezza temporaneamente non disponibile.'},503);
    let body;
    try{
      const text=await request.text();
      if(new TextEncoder().encode(text).length>MAX_BODY)throw new Error('oversized');
      body=JSON.parse(text);
      if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('not-object');
    }catch{return json({error:'Richiesta non valida.'},400)}
    const clients=getClients?.();
    if(!clients?.publicClient||!clients?.adminClient)
      return json({error:'Servizio temporaneamente non disponibile.'},503);
    const {publicClient,adminClient:admin}=clients;
    try{
      if(body.action==='redeem')return await redeem(admin,body,ip,clock,randomUUID,passwordExposed);
      if(!['issue','list','set-access','revoke-invite','remove-pending','remove-activated','reinsert-activated','issue-reset','revoke-reset','revoke-sessions'].includes(body.action))
        return json({error:'Operazione non disponibile.'},400);
      const auth=await getAdmin(request,publicClient,admin,checkSession,checkMfa);
      if(auth.error)return auth.error;
      if(body.action==='list')return await listDrivers(admin);
      if(body.action==='issue')return await issueInvite(admin,auth.userId,body,clock,randomBytes);
       if(body.action==='issue-reset')return await issueReset(admin,auth.userId,body,clock,randomBytes);
       if(body.action==='revoke-reset')return await revokeReset(admin,body);
      if(body.action==='set-access')return await setAccess(admin,body);
      if(body.action==='revoke-sessions')return await revokeDriverSessions(admin,body);
       if(body.action==='remove-pending')return await removePending(admin,body);
       if(body.action==='remove-activated')return await removeActivated(admin,body);
       if(body.action==='reinsert-activated')return await reinsertActivated(admin,body);
      return await revokeInvite(admin,body);
    }catch{
      return json({error:'Servizio temporaneamente non disponibile. Riprova più tardi.'},503);
    }
  };
}
