const ORIGIN='https://lts-booking-security-stage.pasqualemilano0.workers.dev';
const AUTH='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-phone-auth';
function respond(status,data,origin){const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(origin===ORIGIN)h['Access-Control-Allow-Origin']=ORIGIN;return new Response(JSON.stringify(data),{status,headers:h});}
addEventListener('fetch',event=>event.respondWith(handle(event.request)));
async function handle(request){const url=new URL(request.url),origin=request.headers.get('Origin');
if(url.pathname==='/health'&&request.method==='GET')return respond(200,{status:'ok',mode:'QA_ONLY',upstream_booking_enabled:false,production_data_access:false},origin);
if(url.pathname==='/diag/auth-reachability'&&request.method==='GET'){
  // No session or booking is accepted. A fixed fake token tests outbound QA auth only.
  if(origin!==ORIGIN)return respond(403,{error:'ORIGIN_DENIED'},origin);
  if(!TFG_CLIENT_LIMIT)return respond(503,{error:'RATE_LIMIT_NOT_CONFIGURED'},origin);
  const limited=await TFG_CLIENT_LIMIT.limit({key:'diag:'+ (request.headers.get('CF-Connecting-IP')||'unknown')});
  if(!limited.success)return respond(429,{error:'RATE_LIMITED'},origin);
  try{
    const response=await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ 'x'.repeat(80),'Origin':ORIGIN},body:JSON.stringify({action:'session'}),redirect:'manual',signal:AbortSignal.timeout(8000)});
    return respond(200,{mode:'QA_DIAGNOSTIC_ONLY',auth_http_status:response.status,expected_rejection:response.status===401},origin);
  }catch(error){
    return respond(503,{mode:'QA_DIAGNOSTIC_ONLY',error:'AUTH_TRANSPORT_FAILURE',exception_name:String(error?.name||'unknown').slice(0,40),exception_message:String(error?.message||'unknown').slice(0,120)},origin);
  }
}
if(url.pathname!=='/api/tfg_booking')return respond(404,{error:'NOT_FOUND'},origin);
if(origin!==ORIGIN)return respond(403,{error:'ORIGIN_DENIED'},origin);
if(request.method==='OPTIONS'){return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'300','Vary':'Origin'}})}
if(request.method!=='POST')return respond(405,{error:'METHOD_DENIED'},origin);
if(!TFG_CLIENT_LIMIT||!TFG_GLOBAL_LIMIT)return respond(503,{error:'RATE_LIMIT_NOT_CONFIGURED'},origin);
const ip=request.headers.get('CF-Connecting-IP')||'unknown';const client=await TFG_CLIENT_LIMIT.limit({key:ip});const global=await TFG_GLOBAL_LIMIT.limit({key:'all'});
if(!client.success||!global.success)return respond(429,{error:'RATE_LIMITED'},origin);
const bearer=request.headers.get('Authorization')||'';
if(!/^Bearer [A-Za-z0-9._-]{50,4096}$/.test(bearer))return respond(401,{error:'SESSION_REQUIRED'},origin);
let verified;try{const res=await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json','Authorization':bearer,'Origin':ORIGIN},body:JSON.stringify({action:'session'}),redirect:'manual',signal:AbortSignal.timeout(5000)});if(!res.ok)return respond(res.status===403?403:401,{error:'SESSION_REJECTED'},origin);verified=await res.json()}catch{return respond(503,{error:'QA_AUTH_UNAVAILABLE'},origin)}
if(verified?.active!==true||!verified.user_id||!['driver','admin'].includes(verified.role))return respond(403,{error:'ACCOUNT_DENIED'},origin);
if(verified.role==='admin'&&verified.mfa_verified!==true)return respond(403,{error:'MFA_REQUIRED'},origin);
return respond(503,{error:'QA_BOOKING_UPSTREAM_DISABLED',authenticated:true},origin);
}
