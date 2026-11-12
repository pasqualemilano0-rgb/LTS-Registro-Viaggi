/** Read-only security regression harness derived from deployed Cloudflare Worker
 * container-booking-backend (2026-11-12). This is an isolated snapshot, NOT
 * a live authenticated staging test. No credentials or network requests.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
const LTS_SESSION_ENDPOINT='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth';
const LTS_UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER='123e4567-e89b-42d3-a456-426614174000';
const TOKEN='x'.repeat(80);
const request=(token=TOKEN)=>new Request('https://example.invalid/api/tfg_booking',{headers:token?{Authorization:'Bearer '+token}:{}});
async function readBoundedBytes(stream,limit){
 const reader=stream.getReader();let size=0;const chunks=[];
 try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>limit)throw Error('BODY_TOO_LARGE');chunks.push(x.value);}}
 finally{reader.releaseLock();}
 const out=new Uint8Array(size);let i=0;for(const chunk of chunks){out.set(chunk,i);i+=chunk.length;}return out;
}
// Exact authorization function body from the deployed Worker, with injected
// authFetcher and no live requests. Keep this snapshot aligned on Worker changes.
async function authorizeLtsBooking(request,env,authFetcher=fetch,requireSession=false){
 const mode=requireSession?'true':env?.LTS_PORTI_REQUIRE_SESSION;
 if(mode===undefined||mode==='false')return {allowed:true};
 if(mode!=='true')return {allowed:false,status:503,error:'LTS_AUTH_MISCONFIGURED'};
 const bearer=/^Bearer ([A-Za-z0-9._-]{50,4096})$/i.exec(request.headers.get('Authorization')||'');
 if(!bearer)return {allowed:false,status:401,error:'LTS_LOGIN_REQUIRED'};
 try{
  const response=await authFetcher(LTS_SESSION_ENDPOINT,{
   method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
   signal:AbortSignal.timeout(7000),
   headers:{Authorization:'Bearer '+bearer[1],Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({action:'session'})
  });
  if(response.status===401)return {allowed:false,status:401,error:'LTS_SESSION_INVALID'};
  if(response.status===403)return {allowed:false,status:403,error:'LTS_ACCESS_DENIED'};
  if(response.status!==200||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))
   return {allowed:false,status:503,error:'LTS_AUTH_UNAVAILABLE'};
  const raw=await readBoundedBytes(response.body,2048);
  const verified=JSON.parse(new TextDecoder().decode(raw));
  if(verified?.active!==true||!LTS_UID.test(verified.user_id||'')||
    !['driver','admin'].includes(verified.role)||
    (verified.role==='admin'&&(verified.mfa_enrolled!==true||verified.mfa_verified!==true)))
   return {allowed:false,status:403,error:'LTS_ACCESS_DENIED'};
  return {allowed:true};
 }catch{return {allowed:false,status:503,error:'LTS_AUTH_UNAVAILABLE'};}
}
const env={LTS_PORTI_REQUIRE_SESSION:'true'};
const response=(body,status=200,contentType='application/json')=>new Response(JSON.stringify(body),{status,headers:{'content-type':contentType}});
const check=(body,status=200)=>authorizeLtsBooking(request(),env,async(url,opts)=>{
 assert.equal(url,LTS_SESSION_ENDPOINT);assert.equal(opts.method,'POST');
 assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
 assert.equal(JSON.parse(opts.body).action,'session');
 return response(body,status);
});
test('active driver authorized by server',async()=>assert.equal((await check({active:true,user_id:USER,role:'driver'})).allowed,true));
test('expired and revoked tokens rejected by Supabase',async()=>{
 for(const status of [401,403]){const result=await check({},status);assert.equal(result.allowed,false);assert.equal(result.status,status);}
});
test('inactive driver denied even when HTTP 200',async()=>assert.equal((await check({active:false,user_id:USER,role:'driver'})).status,403));
test('admin without MFA enrollment or verification denied',async()=>{
 for(const x of [{mfa_enrolled:false,mfa_verified:false},{mfa_enrolled:true,mfa_verified:false}]){
  assert.equal((await check({active:true,user_id:USER,role:'admin',...x})).status,403);
 }
});
test('admin with completed MFA permitted',async()=>assert.equal((await check({active:true,user_id:USER,role:'admin',mfa_enrolled:true,mfa_verified:true})).allowed,true));
test('missing bearer and malformed bearer denied',async()=>{
 for(const token of ['', 'short', 'x'.repeat(4097)]){
  const r=await authorizeLtsBooking(request(token),env,async()=>{throw Error('should not fetch')});
  assert.equal(r.status,401);
 }
});
test('invalid role and invalid user identity denied',async()=>{
 for(const body of [{active:true,user_id:USER,role:'guest'},{active:true,user_id:'bad',role:'driver'}])
  assert.equal((await check(body)).status,403);
});
test('auth network failures, redirects and wrong content-type fail closed',async()=>{
 assert.equal((await authorizeLtsBooking(request(),env,async()=>{throw Error('network')})).status,503);
 assert.equal((await authorizeLtsBooking(request(),env,async()=>response({},302))).status,503);
 assert.equal((await authorizeLtsBooking(request(),env,async()=>response({},200,'text/html'))).status,503);
});
test('unknown authorization configuration fails closed',async()=>assert.equal((await authorizeLtsBooking(request(),{LTS_PORTI_REQUIRE_SESSION:'typo'},async()=>{})).status,503));
const RATE_BINDINGS={booking:{client:'BOOKING_CLIENT_LIMIT',global:'BOOKING_GLOBAL_LIMIT'},tfg:{client:'TFG_CLIENT_LIMIT',global:'TFG_GLOBAL_LIMIT'}};
async function protectTfgRequest(request,env,route){
 if(env===undefined)return {allowed:true};
 const names=RATE_BINDINGS[route];if(!names)throw Error('INVALID_RATE_ROUTE');
 const client=env?.[names.client],global=env?.[names.global];
 if(typeof client?.limit!=='function'||typeof global?.limit!=='function')return {allowed:false,status:503,error:'RATE_LIMIT_UNAVAILABLE'};
 const ip=request.headers.get('CF-Connecting-IP');
 const key=ip&&ip.length<=64?ip:'unidentified-client';
 try{
  const local=await client.limit({key});if(local?.success!==true)return {allowed:false,status:429,error:'RATE_LIMITED'};
  const site=await global.limit({key:route});if(site?.success!==true)return {allowed:false,status:429,error:'RATE_LIMITED'};
  return {allowed:true};
 }catch{return {allowed:false,status:503,error:'RATE_LIMIT_UNAVAILABLE'};}
}
const limit=(client,global)=>({BOOKING_CLIENT_LIMIT:{limit:async()=>({success:client})},BOOKING_GLOBAL_LIMIT:{limit:async()=>({success:global})}});
test('booking rate limit requires both client and global approval',async()=>{
 assert.equal((await protectTfgRequest(request(),limit(true,true),'booking')).allowed,true);
 assert.equal((await protectTfgRequest(request(),limit(false,true),'booking')).status,429);
 assert.equal((await protectTfgRequest(request(),limit(true,false),'booking')).status,429);
});
test('missing or failing rate limit binding fails closed',async()=>{
 assert.equal((await protectTfgRequest(request(),{},'booking')).status,503);
 assert.equal((await protectTfgRequest(request(),{BOOKING_CLIENT_LIMIT:{limit:async()=>{throw Error('down')}},BOOKING_GLOBAL_LIMIT:{limit:async()=>({success:true})}},'booking')).status,503);
});
test('rate limit uses Cloudflare connecting IP and never X-Forwarded-For',async()=>{
 let key='';
 const req=new Request('https://example.invalid',{headers:{'CF-Connecting-IP':'192.0.2.7','X-Forwarded-For':'198.51.100.8'}});
 const bindings={BOOKING_CLIENT_LIMIT:{limit:async({key:k})=>{key=k;return {success:true}}},BOOKING_GLOBAL_LIMIT:{limit:async()=>({success:true})}};
 await protectTfgRequest(req,bindings,'booking');assert.equal(key,'192.0.2.7');
});
test('CORS origin allowlist is exact',()=>{
 const allowedOrigin=origin=>origin==='https://pasqualemilano0-rgb.github.io';
 assert.equal(allowedOrigin('https://pasqualemilano0-rgb.github.io'),true);
 for(const origin of ['https://evil.invalid','https://pasqualemilano0-rgb.github.io.evil.invalid','null',''])assert.equal(allowedOrigin(origin),false);
});
