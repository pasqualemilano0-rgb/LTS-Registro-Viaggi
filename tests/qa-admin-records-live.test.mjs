import test from 'node:test';
import assert from 'node:assert/strict';
const ENDPOINT='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-admin-records';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
// Retry transport failures only. Never retry an HTTP response (including 5xx).
const TRANSIENT_CODES=new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
function isTransientTransportError(error){
 return error?.name==='TimeoutError'||(error?.name==='TypeError'&&TRANSIENT_CODES.has(error.cause?.code));
}
async function fetchWithTransportRetry(url,init,{
 fetchImpl=fetch,makeSignal=()=>AbortSignal.timeout(30000),
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),warn=message=>console.warn(message)
}={}){
 for(let attempt=1;attempt<=3;attempt++){
  try{return await fetchImpl(url,{...init,signal:makeSignal()});}
  catch(error){
   if(attempt===3||!isTransientTransportError(error))throw error;
   warn('Admin archive '+init.method+': transport failure on attempt '+attempt+'/3 ('+(error.cause?.code||error.name)+'); retrying.');
   await wait(attempt*1000);
  }
 }
}

// Offline regressions: no credentials or network calls.
test('archive retry recovers from timeouts with fresh signals and bounded backoff',async()=>{
 let calls=0;const signals=[],delays=[],warnings=[];
 const response={status:401};
 const actual=await fetchWithTransportRetry(ENDPOINT,{method:'POST'},{
  fetchImpl:async(_url,init)=>{signals.push(init.signal);if(++calls<3)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});return response;},
  makeSignal:()=>({}),wait:async ms=>{delays.push(ms);},warn:m=>warnings.push(m)
 });
 assert.equal(actual,response);assert.equal(calls,3);assert.equal(new Set(signals).size,3);
 assert.deepEqual(delays,[1000,2000]);assert.equal(warnings.length,2);
});
test('archive retry exhausts three attempts and preserves transport failure',async()=>{
 const error=Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}});
 let calls=0;
 await assert.rejects(fetchWithTransportRetry(ENDPOINT,{method:'OPTIONS'},{
  fetchImpl:async()=>{calls++;throw error;},makeSignal:()=>({}),wait:async()=>{},warn:()=>{}
 }),e=>e===error);
 assert.equal(calls,3);
});
test('archive retry never masks HTTP errors or unexpected exceptions',async()=>{
 for(const status of [200,403,429,500,503]){
  let calls=0;const response={status};
  assert.equal(await fetchWithTransportRetry(ENDPOINT,{method:'POST'},{
   fetchImpl:async()=>{calls++;return response;},makeSignal:()=>({}),wait:async()=>{throw Error('unexpected retry');}
  }),response);
  assert.equal(calls,1);
 }
 const error=Object.assign(new TypeError('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}});
 let calls=0;
 await assert.rejects(fetchWithTransportRetry(ENDPOINT,{method:'OPTIONS'},{
  fetchImpl:async()=>{calls++;throw error;},makeSignal:()=>({}),wait:async()=>{throw Error('unexpected retry');}
 }),e=>e===error);
 assert.equal(calls,1);
});
test('admin archive endpoint handles browser CORS before auth and refuses anonymous reads and writes',async()=>{
 const opts=await fetchWithTransportRetry(ENDPOINT,{
  method:'OPTIONS',redirect:'manual',headers:{
   Origin:ORIGIN,'Access-Control-Request-Method':'POST',
   'Access-Control-Request-Headers':'authorization,content-type'
  }});
 assert.equal(opts.status,204,'Browser must be able to call the authenticated editor');
 assert.equal(opts.headers.get('access-control-allow-origin'),ORIGIN);
 const data=[
  {action:'list'},
  {action:'read',driverId:'3bfc2a56-6f4f-490e-bafe-84a6b11c33e4'},
  {action:'mutate',driverId:'3bfc2a56-6f4f-490e-bafe-84a6b11c33e4',
   expectedRevision:0,operation:'delete',category:'trip',recordId:'fake',
   requestId:'no-auth-test-id-2026',reason:'non autorizzata'}
 ];
 for(const payload of data){
  const res=await fetchWithTransportRetry(ENDPOINT,{
   method:'POST',redirect:'manual',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify(payload)
  });
  assert.equal(res.status,401,'Unauthenticated admin request must be rejected');
  assert.equal(res.headers.get('access-control-allow-origin'),ORIGIN);
  const message=await res.json();
  assert.equal(typeof message.error,'string');
 }
});
