import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ID='11111111-1111-4111-8111-111111111111';
const vaultSource=readFileSync(new URL('../driver-session-vault.mjs',import.meta.url),'utf8');
const authSource=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');

// Real AES-GCM/WebCrypto with a minimal asynchronous IndexedDB test double.
const backing=new Map();
let opened=false;
function fakeDatabase(){
 return {
  createObjectStore:()=>{},
  close:()=>{},
  transaction:()=>{
   let pending=0,complete=false;
   const tx={oncomplete:null,onerror:null,onabort:null};
   function op(run){
    pending++;
    const req={result:undefined,onsuccess:null};
    queueMicrotask(()=>{
      try{req.result=run();req.onsuccess?.();}catch{tx.onerror?.();}
      pending--;
      if(!pending&&!complete){complete=true;queueMicrotask(()=>tx.oncomplete?.());}
    });
    return req;
   }
   tx.objectStore=()=>({
    get:key=>op(()=>backing.get(key)),
    put:(value,key)=>op(()=>backing.set(key,value)),
    clear:()=>op(()=>backing.clear())
   });
   return tx;
  }
 };
}
globalThis.indexedDB={open:()=>{const req={result:fakeDatabase(),onupgradeneeded:null,onsuccess:null};
 queueMicrotask(()=>{if(!opened){opened=true;req.onupgradeneeded?.();}req.onsuccess?.();});
 return req;
}};
const vault=await import('../driver-session-vault.mjs');

test('driver refresh secret is AES-encrypted and recoverable without storing access tokens',async()=>{
 const value={user_id:ID,role:'driver',refresh_token:'refreshtoken_1234567890'};
 assert.equal(await vault.writeDriverToken(value),true);
 assert.deepEqual(await vault.readDriverToken(),value);
 assert.equal(backing.has('refresh'),true);
 assert.ok(backing.get('key') instanceof CryptoKey);
 assert.equal(backing.get('key').extractable,false);
 assert.ok(!JSON.stringify([...backing.entries()].filter(([k])=>k==='refresh')).includes(value.refresh_token));
 assert.ok(!JSON.stringify([...backing.entries()].filter(([k])=>k==='refresh')).includes(ID));
});
test('logout can erase durable secret; admin may not be stored as driver',async()=>{
 assert.equal(await vault.clearDriverToken(),true);
 assert.equal(await vault.readDriverToken(),null);
 await assert.rejects(vault.writeDriverToken({user_id:ID,role:'admin',refresh_token:'secret12345678'}),/autista/);
 assert.equal(await vault.readDriverToken(),null);
});
test('driver app always verifies backend identity before cached trips and retains offline gate',()=>{
 assert.match(appSource,/await accountAccess[.]restoreDriverSession\(\)/);
 assert.match(appSource,/result=await store[.]activateAccountFromSession\(\)/);
 assert.ok(appSource.indexOf('await accountAccess.restoreDriverSession()')<
   appSource.indexOf('result=await store.activateAccountFromSession()'));
 assert.match(authSource,/if\(restored\)await verifySession\(\)/);
 assert.match(authSource,/if\(\[401,403\][.]includes\(error[.]status\)\)revoke\(\)/);
 assert.match(authSource,/lts-driver-refresh-lock/);
 assert.match(authSource,/void enqueueVault\(\(\)=>clearDriverToken\(\)\)/);
 assert.match(authSource,/next[.]role==='driver'/);
 assert.match(appSource,/Serve Internet per verificare la sessione salvata/);
});

test('first login survives browser restart; disabled driver cannot restore; offline token remains for retry',async()=>{
 const records=new Map(),mode={allowed:true,refresh:'refresh-test-00001',next:1};
 const sessionStorage={getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,String(v)),removeItem:k=>records.delete(k)};
 const localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
 globalThis.sessionStorage=sessionStorage;globalThis.localStorage=localStorage;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 globalThis.window=new EventTarget();
 globalThis.__ltsTestVault=vault;
 const base='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/';
 globalThis.fetch=async(url,request)=>{
  assert.ok(url.startsWith(base));
  const data=JSON.parse(request.body);
  if(data.action==='login')return new Response(JSON.stringify({
   user_id:ID,role:'driver',access_token:'a'.repeat(100),
   refresh_token:mode.refresh,expires_in:3600
  }),{headers:{'Content-Type':'application/json'}});
  if(data.action==='refresh'){
   if(!mode.allowed||data.refresh_token!==mode.refresh)
    return new Response(JSON.stringify({error:'Sessione non valida'}),{status:403,headers:{'Content-Type':'application/json'}});
   mode.refresh='refresh-test-'+String(++mode.next).padStart(5,'0');
   return new Response(JSON.stringify({
    user_id:ID,role:'driver',access_token:'r'.repeat(100),
    refresh_token:mode.refresh,expires_in:3600
   }),{headers:{'Content-Type':'application/json'}});
  }
  if(data.action==='session')return new Response(JSON.stringify({
   active:mode.allowed,user_id:ID,role:'driver'
  }),{headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify({error:'Unexpected'}),{status:500,headers:{'Content-Type':'application/json'}});
 };
 const cfg={accountAuth:{enabled:true,loginEndpoint:base+'lts-phone-auth',
   archiveEndpoint:base+'lts-account-state',onboardingEndpoint:base+'lts-driver-onboarding'}};
 const src=authSource.replace("import runtime from '/runtime-config.mjs';",
     'const runtime='+JSON.stringify(cfg)+';')
   .replace("import {readDriverToken,writeDriverToken,clearDriverToken} from '/driver-session-vault.mjs';",
     'const {readDriverToken,writeDriverToken,clearDriverToken}=globalThis.__ltsTestVault;');
 let nextModule=0;
 const loaded=()=>import('data:text/javascript;base64,'+
    Buffer.from(src+'\n// browser reload '+(++nextModule)).toString('base64'));
 const first=await loaded();
 const signed=await first.login('3000000000','a-real-user-would-type-password');
 assert.equal(signed.remembered,true);
 assert.equal(first.isVerified(),true);
 assert.equal((await vault.readDriverToken()).refresh_token,mode.refresh);
 // Browser restart discards sessionStorage but leaves encrypted device vault.
 sessionStorage.removeItem('lts-supabase-account-session-v1');
 const reopened=await loaded();
 assert.equal(reopened.hasSession(),false);
 assert.equal(await reopened.restoreDriverSession(),true);
 assert.equal(reopened.isVerified(),true);
 assert.equal((await vault.readDriverToken()).refresh_token,mode.refresh);
 // A subsequent restart with revoked server access must never reopen an archive.
 mode.allowed=false;
 sessionStorage.removeItem('lts-supabase-account-session-v1');
 const blocked=await loaded();
 await assert.rejects(blocked.restoreDriverSession(),e=>e.status===403);
 assert.equal(blocked.hasSession(),false);
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(await vault.readDriverToken(),null);
 // Offline is not a revocation: keep credentials but refuse to unlock.
 await vault.writeDriverToken({user_id:ID,role:'driver',refresh_token:'refresh-test-offline'});
 navigator.onLine=false;
 const offline=await loaded();
 await assert.rejects(offline.restoreDriverSession(),e=>e.offline===true);
 assert.equal(offline.isVerified(),false);
 assert.equal((await vault.readDriverToken()).refresh_token,'refresh-test-offline');
 navigator.onLine=true;
 offline.signOut();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(await vault.readDriverToken(),null);
 delete globalThis.__ltsTestVault;
});
