/** Public release gate: CORS and JWT smoke without any credentials or driver data. */
import assert from 'node:assert/strict';
const endpoint='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-company-report';
const allowed='https://pasqualemilano0-rgb.github.io';
const denied='https://untrusted.invalid';
const timeout=12000;
async function call(method,origin,{headers={},body=null}={}){
 const res=await fetch(endpoint,{
  method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(timeout),
  headers:{Origin:origin,...headers},
  ...(body===null?{}:{body:JSON.stringify(body)})
 });
 const response={status:res.status,cors:res.headers.get('access-control-allow-origin')||'',
  cache:res.headers.get('cache-control')||'',text:(await res.text()).slice(0,140)};
 console.log(method,origin,response.status,'CORS:',response.cors||'(none)');
 return response;
}
const preflight={
 'Access-Control-Request-Method':'POST',
 'Access-Control-Request-Headers':'authorization,content-type'
};
const good=await call('OPTIONS',allowed,{headers:preflight});
assert.equal(good.status,204,'Authenticated browser preflight must succeed');
assert.equal(good.cors,allowed,'Only official site may receive CORS');
const hostile=await call('OPTIONS',denied,{headers:preflight});
assert.notEqual(hostile.cors,denied,'Untrusted origin must not be granted CORS');
const guest=await call('POST',allowed,{headers:{'Content-Type':'application/json'},
 body:{action:'overview',month:'2026-11',offset:0,limit:40}});
assert.equal(guest.status,401,'Anonymous report request must be denied');
const forged=await call('POST',allowed,{headers:{'Content-Type':'application/json',
 'Authorization':'Bearer '+'a'.repeat(72)},
 body:{action:'overview',month:'2026-11'}});
assert.equal(forged.status,401,'Invalid JWT must not access reports');
// V3 route must be protected by the same JWT and role/MFA gate.
for(const auth of [null,'Bearer '+'b'.repeat(72)]){
 const res=await call('POST',allowed,{headers:{'Content-Type':'application/json',
  ...(auth?{'Authorization':auth}:{})},
  body:{action:'insights',month:'2026-11'}});
 assert.equal(res.status,401,'Company insights must deny anonymous and forged tokens');
}
console.log('PASS production V3: trusted origin only; overview and insights deny anonymous/forged tokens; no real data read.');
