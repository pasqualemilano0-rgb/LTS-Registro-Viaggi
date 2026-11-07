import test from 'node:test';
import assert from 'node:assert/strict';
const ENDPOINT='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-admin-records';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
test('admin archive endpoint handles browser CORS before auth and refuses anonymous reads and writes',async()=>{
 const opts=await fetch(ENDPOINT,{
  method:'OPTIONS',redirect:'manual',headers:{
   Origin:ORIGIN,'Access-Control-Request-Method':'POST',
   'Access-Control-Request-Headers':'authorization,content-type'
  },signal:AbortSignal.timeout(10000)});
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
  const res=await fetch(ENDPOINT,{
   method:'POST',redirect:'manual',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
  });
  assert.equal(res.status,401,'Unauthenticated admin request must be rejected');
  assert.equal(res.headers.get('access-control-allow-origin'),ORIGIN);
  const message=await res.json();
  assert.equal(typeof message.error,'string');
 }
});
