/**
 * QA-only HTTP boundary smoke. No real credentials, private documents or writes.
 * Runs in the existing CircleCI small job.
 */
import assert from 'node:assert/strict';
const api='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-payroll-secure-qa';
const allowed='https://lts-test-pr205.pasqualemilano0.workers.dev';
const forbidden='https://pasqualemilano0-rgb.github.io';
async function call(method,origin,options={}){
 const response=await fetch(api,{
  method,redirect:'error',signal:AbortSignal.timeout(14000),
  headers:{Origin:origin,...(options.headers||{})},
  ...(options.body?{body:options.body}:{})
 });
 await response.arrayBuffer();
 return {status:response.status,headers:response.headers};
}
// Verify only credential-free rejection behavior. Never authenticate.
const pre=await call('OPTIONS',allowed,{headers:{
 'Access-Control-Request-Method':'POST',
 'Access-Control-Request-Headers':'authorization,content-type'
}});
assert.equal(pre.status,204,'QA origin should preflight an authorized POST');
assert.equal(pre.headers.get('access-control-allow-origin'),allowed);
const noJwt=await call('POST',allowed,{headers:{'Content-Type':'application/json'},body:'{"action":"list"}'});
assert.equal(noJwt.status,401,'Missing JWT cannot access documents');
const invalid=await call('POST',allowed,{headers:{
 'Authorization':'Bearer '+('x'.repeat(70)),'Content-Type':'application/json'
},body:'{"action":"passkey-status"}'});
assert.equal(invalid.status,401,'Invalid JWT cannot perform passkey operations');
const cross=await call('POST',forbidden,{headers:{'Content-Type':'application/json'},body:'{"action":"list"}'});
assert.equal(cross.status,403,'Production origin cannot use QA document endpoint');
const wrongHeaders=await call('OPTIONS',allowed,{headers:{
 'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-bypass'
}});
assert.equal(wrongHeaders.status,403,'Unexpected headers must fail CORS');
console.log('QA payroll boundary smoke: 204/401/401/403/403');
