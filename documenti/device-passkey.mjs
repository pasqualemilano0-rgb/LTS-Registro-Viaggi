/**
 * Browser-native WebAuthn adapter (no remote scripts, biometric secrets, or PIN access).
 * Works with modern Android Chrome and iOS Safari; the operating system chooses
 * fingerprint, face recognition or device PIN. All assertions are verified SERVER-SIDE.
 */
function decode(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,4096}$/.test(value))
  throw new Error('Dati di sicurezza non validi.');
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function encode(buffer){
 let raw='';for(const byte of new Uint8Array(buffer))raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function descriptors(arr){
 return (arr||[]).map(item=>({type:item.type||'public-key',
  id:decode(item.id),...(item.transports?{transports:item.transports}:{})}));
}
export async function supported(){
 if(!window.isSecureContext||!window.PublicKeyCredential||
   !navigator.credentials?.create||!navigator.credentials?.get)return false;
 if(typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==='function')
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
 return false; // Do not claim a weak unlock fallback as biometric/device verification.
}
function jsonCredential(value,kind){
 if(!value||value.type!=='public-key'||!value.id)throw Error('Sblocco del dispositivo annullato.');
 if(typeof value.toJSON==='function')return value.toJSON();
 const base={
  id:value.id,rawId:encode(value.rawId),type:value.type,
  clientExtensionResults:value.getClientExtensionResults?.()||{},
  ...(value.authenticatorAttachment?{authenticatorAttachment:value.authenticatorAttachment}:{})
 };
 if(kind==='registration'){
  return {...base,response:{
   clientDataJSON:encode(value.response.clientDataJSON),
   attestationObject:encode(value.response.attestationObject),
   transports:value.response.getTransports?.()||[]
  }};
 }
 return {...base,response:{
  clientDataJSON:encode(value.response.clientDataJSON),
  authenticatorData:encode(value.response.authenticatorData),
  signature:encode(value.response.signature),
  userHandle:value.response.userHandle?encode(value.response.userHandle):null
 }};
}
export async function createPasskey(options){
 if(!await supported())throw Error('Questo dispositivo o browser non supporta lo sblocco sicuro. Usa Chrome o Safari aggiornati con blocco schermo attivo.');
 if(!options?.challenge||!options?.user?.id||!options?.rp?.id)
  throw Error('Configurazione passkey incompleta.');
 const publicKey={...options,
  challenge:decode(options.challenge),
  user:{...options.user,id:decode(options.user.id)},
  excludeCredentials:descriptors(options.excludeCredentials),
  authenticatorSelection:{...options.authenticatorSelection,
   authenticatorAttachment:'platform',userVerification:'required'}
 };
 const credential=await navigator.credentials.create({publicKey});
 return jsonCredential(credential,'registration');
}
export async function verifyPasskey(options){
 if(!await supported())throw Error('Questo dispositivo non supporta la verifica passkey con sblocco schermo.');
 if(!options?.challenge||!options?.rpId||!Array.isArray(options.allowCredentials)||
   !options.allowCredentials.length)throw Error('Nessun dispositivo associato.');
 const publicKey={...options,challenge:decode(options.challenge),
  allowCredentials:descriptors(options.allowCredentials),
  userVerification:'required'
 };
 const credential=await navigator.credentials.get({publicKey});
 return jsonCredential(credential,'authentication');
}
