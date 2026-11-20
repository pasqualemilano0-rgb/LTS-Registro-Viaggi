/**
 * WebAuthn device step-up for LTS payroll (DRAFT: isolated staging only).
 * Enforced on the SERVER before ANY driver list, PDF read or acknowledgement.
 * No biometric templates, PINs, passwords or raw unlock secrets are persisted.
 */
import {
 generateRegistrationOptions, verifyRegistrationResponse,
 generateAuthenticationOptions, verifyAuthenticationResponse
} from 'npm:@simplewebauthn/server@13.3.0';

const ORIGIN='https://pasqualemilano0-rgb.github.io';
const RPID='pasqualemilano0-rgb.github.io';
const RP_NAME='LTS Registro Viaggi';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{24,1024}$/;
const TICKET=/^[A-Za-z0-9_-]{43}$/;
const CHALLENGE_TTL=90000;
export const UNLOCK_TTL_MS=180000; // Max 3 minutes; UI also locks immediately on background.
const fail=(status,message)=>{throw {status,message};};
const asBase64=url=>url.replace(/-/g,'+').replace(/_/g,'/');
function fromB64url(text){
 if(!KEY.test(text))fail(400);
 return Uint8Array.from(atob(asBase64(text).padEnd(Math.ceil(text.length/4)*4,'=')),x=>x.charCodeAt(0));
}
function toB64url(bytes){
 let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
const hash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
function onlyDriver(actor){
 if(actor.role!=='driver'||!UUID.test(actor.userId)||!UUID.test(actor.sessionId))fail(403);
}
async function passkeys(db,userId){
 const {data,error}=await db.from('lts_payroll_passkeys')
  .select('credential_id,public_key,counter,transports,device_type,backed_up')
  .eq('user_id',userId).is('revoked_at',null).limit(6);
 if(error||!Array.isArray(data))fail(503,'Passkey non disponibili.');
 if(data.length>5)fail(503,'Numero dispositivi superiore al consentito.');
 return data;
}
async function addChallenge(db,actor,purpose,challenge){
 const {data,error}=await db.from('lts_payroll_webauthn_challenges')
  .insert({user_id:actor.userId,session_id:actor.sessionId,purpose,challenge,
   expires_at:new Date(Date.now()+CHALLENGE_TTL).toISOString()})
  .select('id').single();
 if(error||!data?.id)fail(503,'Non è possibile preparare lo sblocco.');
 return data.id;
}
async function consumeChallenge(db,actor,id,purpose){
 if(!UUID.test(id||''))fail(400);
 const {data,error}=await db.rpc('lts_payroll_consume_webauthn_challenge',{
  p_id:id,p_user:actor.userId,p_session:actor.sessionId,p_purpose:purpose
 });
 if(error)fail(503);
 if(typeof data!=='string'||data.length<32)fail(401,'Verifica scaduta. Riprova.');
 return data;
}
async function verifyPasswordReentry(publicClient,privateClient,actor,password){
 // A stolen LTS session alone must not enroll an attacker's passkey.
 // Require actual LTS password again, checked against Supabase Auth; fail closed.
 if(typeof password!=='string'||password.length<12||password.length>128)fail(400,'Inserisci la password del tuo account LTS.');
 const {data:allowed,error:limitError}=await privateClient.rpc('lts_payroll_claim_enroll_attempt',{
  p_user:actor.userId
 });
 if(limitError||typeof allowed!=='boolean')fail(503);
 if(!allowed)fail(429,'Troppi tentativi. Riprova più tardi.');
 const {data:lookup,error:lookupError}=await privateClient.auth.admin.getUserById(actor.userId);
 if(lookupError||!lookup?.user?.email)fail(503);
 const {data:verified,error:passwordError}=await publicClient.auth.signInWithPassword({
  email:lookup.user.email,password
 });
 try{
  if(passwordError||verified?.user?.id!==actor.userId||!verified?.session?.access_token)
   fail(401,'Password LTS non valida.');
 }finally{
  // Revoke the temporary password-check session; not the user's original session.
  if(verified?.session)try{await publicClient.auth.signOut();}catch{}
 }
}
async function registerOptions(api,actor,input){
 onlyDriver(actor);
 await verifyPasswordReentry(api.auth,api.db,actor,input.password);
 const existing=await passkeys(api.db,actor.userId);
 if(existing.length>=5)fail(409,'Massimo cinque dispositivi registrati.');
 const options=await generateRegistrationOptions({
  rpName:RP_NAME,rpID:RPID,userName:'LTS-'+actor.userId.slice(0,8),
  userID:new TextEncoder().encode(actor.userId),
  userDisplayName:'Documenti personali LTS',
  attestationType:'none',supportedAlgorithmIDs:[-7,-257],
  excludeCredentials:existing.map(x=>({id:x.credential_id,transports:x.transports||[]})),
  authenticatorSelection:{
   authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'
  }
 });
 const challengeId=await addChallenge(api.db,actor,'register',options.challenge);
 return {challengeId,options};
}
async function registerVerify(api,actor,input){
 onlyDriver(actor);
 const challenge=await consumeChallenge(api.db,actor,input.challengeId,'register');
 if(!input.credential||typeof input.credential!=='object')fail(400);
 let verification;
 try{
  verification=await verifyRegistrationResponse({
   response:input.credential,expectedChallenge:challenge,
   expectedOrigin:ORIGIN,expectedRPID:RPID,requireUserVerification:true
  });
 }catch{fail(401,'Autenticazione dispositivo non verificata.');}
 if(!verification?.verified||!verification.registrationInfo?.userVerified)fail(401);
 const info=verification.registrationInfo;
 const credential=info.credential;
 if(!KEY.test(credential?.id||'')||!credential?.publicKey?.length)fail(503);
 const existing=await passkeys(api.db,actor.userId);
 if(existing.length>=5)fail(409);
 const {error}=await api.db.from('lts_payroll_passkeys').insert({
  credential_id:credential.id,user_id:actor.userId,
  public_key:toB64url(credential.publicKey),counter:credential.counter,
  transports:credential.transports||input.credential.response?.transports||[],
  device_type:info.credentialDeviceType,
  backed_up:info.credentialBackedUp===true
 });
 if(error)fail(409,'La passkey risulta già registrata o non è valida.');
 return {registered:true};
}
async function unlockOptions(api,actor){
 onlyDriver(actor);
 const keys=await passkeys(api.db,actor.userId);
 if(!keys.length)fail(428,'Registra prima lo sblocco del dispositivo.');
 const options=await generateAuthenticationOptions({
  rpID:RPID,userVerification:'required',
  allowCredentials:keys.map(x=>({id:x.credential_id,transports:x.transports||[]}))
 });
 const challengeId=await addChallenge(api.db,actor,'unlock',options.challenge);
 return {challengeId,options};
}
async function unlockVerify(api,actor,input){
 onlyDriver(actor);
 const challenge=await consumeChallenge(api.db,actor,input.challengeId,'unlock');
 const response=input.credential;
 if(!response||typeof response!=='object'||!KEY.test(response.id||''))fail(400);
 const {data:stored,error}=await api.db.from('lts_payroll_passkeys')
  .select('credential_id,public_key,counter,transports')
  .eq('credential_id',response.id).eq('user_id',actor.userId)
  .is('revoked_at',null).maybeSingle();
 if(error)fail(503);
 if(!stored)fail(403,'Dispositivo non autorizzato.');
 let verification;
 try{
  verification=await verifyAuthenticationResponse({
   response,expectedChallenge:challenge,expectedOrigin:ORIGIN,
   expectedRPID:RPID,requireUserVerification:true,
   credential:{
    id:stored.credential_id,publicKey:fromB64url(stored.public_key),
    counter:Number(stored.counter),transports:stored.transports||[]
   }
  });
 }catch{fail(401,'Sblocco del dispositivo non riuscito.');}
 if(!verification?.verified||!verification.authenticationInfo?.userVerified)fail(401);
 // Optimistic concurrency guard against replayed counters from cloned authenticators.
 const {data:counterUpdate,error:counterError}=await api.db.from('lts_payroll_passkeys')
  .update({counter:verification.authenticationInfo.newCounter,last_used_at:new Date().toISOString()})
  .eq('credential_id',stored.credential_id).eq('user_id',actor.userId)
  .eq('counter',stored.counter).is('revoked_at',null)
  .select('credential_id').maybeSingle();
 if(counterError||!counterUpdate)fail(409,'Verifica già utilizzata. Ripeti lo sblocco.');
 const secret=toB64url(crypto.getRandomValues(new Uint8Array(32)));
 const {error:saveError}=await api.db.from('lts_payroll_device_unlocks')
  .upsert({user_id:actor.userId,session_id:actor.sessionId,
   credential_id:stored.credential_id,token_hash:await hash(secret),
   expires_at:new Date(Date.now()+UNLOCK_TTL_MS).toISOString()},
   {onConflict:'user_id,session_id'});
 if(saveError)fail(503,'Impossibile abilitare la consultazione.');
 return {unlockToken:secret,expiresInMs:UNLOCK_TTL_MS};
}
export async function requireDocumentUnlock(api,actor,unlockToken){
 onlyDriver(actor);
 if(typeof unlockToken!=='string'||!TICKET.test(unlockToken))fail(423,'Sblocca i documenti dal tuo dispositivo.');
 const tokenHash=await hash(unlockToken);
 const {data,error}=await api.db.from('lts_payroll_device_unlocks')
  .select('credential_id').eq('user_id',actor.userId)
  .eq('session_id',actor.sessionId).eq('token_hash',tokenHash)
  .gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error)fail(503);
 if(!data)fail(423,'Sblocco scaduto. Ripeti Face ID, impronta o PIN.');
 // Revoking the registered passkey immediately invalidates existing unlocks.
 const {data:active,error:credentialError}=await api.db.from('lts_payroll_passkeys')
  .select('credential_id').eq('credential_id',data.credential_id)
  .eq('user_id',actor.userId).is('revoked_at',null).maybeSingle();
 if(credentialError)fail(503);
 if(!active)fail(423,'Dispositivo non autorizzato.');
}
async function lock(api,actor,input){
 onlyDriver(actor);
 // Logout is deliberately not required for locking the document area.
 // Token is optional; only an active verified LTS session can revoke its unlock.
 const {error}=await api.db.from('lts_payroll_device_unlocks')
  .delete().eq('user_id',actor.userId).eq('session_id',actor.sessionId);
 if(error)fail(503);
 return {locked:true};
}
export async function deviceAction(action,api,actor,input){
 onlyDriver(actor);
 switch(action){
  case 'passkey-status':return {enrolled:(await passkeys(api.db,actor.userId)).length>0};
  case 'passkey-register-options':return registerOptions(api,actor,input);
  case 'passkey-register-verify':return registerVerify(api,actor,input);
  case 'passkey-unlock-options':return unlockOptions(api,actor);
  case 'passkey-unlock-verify':return unlockVerify(api,actor,input);
  case 'passkey-lock':return lock(api,actor,input);
  default:fail(400);
 }
}
