/**
 * Driver-only durable refresh-token vault. Rotated opaque refresh secret
 * and UUID are encrypted with a non-extractable, origin-scoped AES key.
 * Encryption deters casual at-rest reading, NOT origin-based XSS.
 */
const DB_NAME='lts-driver-login-v1', STORE='credentials';
const encoder=new TextEncoder(),decoder=new TextDecoder();
function supported(){return Boolean(globalThis.indexedDB&&globalThis.crypto?.subtle&&globalThis.crypto?.getRandomValues);}
function openDb(){
 if(!supported())return Promise.reject(new Error('Memoria protetta non disponibile.'));
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB_NAME,1);
   req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(new Error('Impossibile aprire la memoria protetta.'));
   req.onblocked=()=>reject(new Error('Memoria protetta occupata.'));
 });
}
function entries(db){
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly'),table=tx.objectStore(STORE);
   let key,entry;
   const a=table.get('key'),b=table.get('refresh');
   a.onsuccess=()=>{key=a.result;};
   b.onsuccess=()=>{entry=b.result;};
   tx.oncomplete=()=>resolve({key,entry});
   tx.onerror=tx.onabort=()=>reject(new Error('Impossibile leggere la sessione salvata.'));
 });
}
function transact(db,callback){
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   callback(tx.objectStore(STORE));
   tx.oncomplete=()=>resolve(true);
   tx.onerror=tx.onabort=()=>reject(new Error('Impossibile aggiornare la sessione salvata.'));
 });
}
export async function readDriverToken(){
 if(!supported())return null;
 const db=await openDb();
 let key,entry;
 try{({key,entry}=await entries(db));}
 finally{db.close();}
 if(!entry)return null;
 try{
   if(!key||!Array.isArray(entry.iv)||!Array.isArray(entry.cipher))throw Error('Invalid vault');
   const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(entry.iv)},
     key,new Uint8Array(entry.cipher));
   const data=JSON.parse(decoder.decode(result));
   if(data?.role!=='driver'||typeof data?.user_id!=='string'||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.user_id)||
       typeof data.refresh_token!=='string'||!/^[A-Za-z0-9._-]{8,4096}$/.test(data.refresh_token))
     throw Error('Invalid vault');
   return Number.isSafeInteger(data.rotated_at)&&data.rotated_at>0
     ?{...data,rotated_at:data.rotated_at}
     :{user_id:data.user_id,role:data.role,refresh_token:data.refresh_token};
 }catch{
   await clearDriverToken().catch(()=>{});
   return null;
 }
}
export async function writeDriverToken({user_id,role,refresh_token,rotated_at=0}){
 if(!supported())return false;
 if(role!=='driver'||typeof user_id!=='string'||typeof refresh_token!=='string')
   throw new Error('Identità autista non valida.');
 const db=await openDb();
 try{
   let {key}=await entries(db);
   const created=!key;
   if(!key)key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,
     encoder.encode(JSON.stringify({user_id,role,refresh_token,rotated_at})));
   await transact(db,table=>{
     if(created)table.put(key,'key');
     table.put({iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))},'refresh');
   });
   return true;
 }finally{db.close();}
}
export async function clearDriverToken(){
 if(!supported())return false;
 const db=await openDb();
 try{return await transact(db,table=>table.clear());}
 finally{db.close();}
}
