const ORIGIN='https://lts-booking-security-stage.pasqualemilano0.workers.dev';
const ANDROID_QA_ORIGIN='https://lts-tfg-android-qa-stage.pasqualemilano0.workers.dev';
const allowedApiOrigin=origin=>origin===ORIGIN||origin===ANDROID_QA_ORIGIN;
const AUTH='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-phone-auth';
const TFG_SOURCE='https://tfg.bucci.it/@/TFGW_WW_BKK';
async function publicTfgLookup(booking){
  const response=await fetch(TFG_SOURCE,{method:'POST',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{'Accept':'text/html','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({modo:'2',bkk:booking}).toString()});
  if(response.status!==200||response.redirected||(response.url&&response.url!==TFG_SOURCE)||!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw Error('TFG_UPSTREAM_UNVERIFIED');
  const declared=Number(response.headers.get('content-length')||'0');
  if(declared>100000)throw Error('TFG_RESPONSE_TOO_LARGE');
  const reader=response.body?.getReader();if(!reader)throw Error('TFG_EMPTY_RESPONSE');
  const chunks=[];let length=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>100000)throw Error('TFG_RESPONSE_TOO_LARGE');chunks.push(chunk.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bytes=new Uint8Array(length);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length}
  const html=new TextDecoder('iso-8859-1').decode(bytes);
  let title='',text='',blocked=false;
  const rewriter=new HTMLRewriter().on('title',{text(c){title+=c.text}}).on('input[type="password"],form[action*="login"],[class*="captcha"],[id*="captcha"]',{element(){blocked=true}}).on('body',{text(c){text+=c.text+' '}});
  await rewriter.transform(new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}})).text();
  const clean=x=>x.replace(/\s+/g,' ').trim();
  if(blocked||clean(title).toUpperCase()!=='EXPORT BOOKING'||/CAPTCHA|PASSWORD|ACCESSO NEGATO|AUTENTICAZIONE|ERRORE DI SISTEMA/i.test(text))return {status:'unverified',message:'Risposta TFG non verificabile.'};
  const codes=[...text.matchAll(/\bBOOKING\s*(?:N(?:R|\.)?\.?)?\s*[:#]\s*([A-Z0-9/-]+)/gi)].map(m=>m[1].toUpperCase());
  if(codes.some(c=>c!==booking))return {status:'unverified',message:'Booking nella risposta differente.'};
  const matches=[...text.matchAll(/\b(?:M\s*\/\s*V|MV|NAVE)\s+([A-Z][A-Z0-9 .,'-]{2,70}?)\s+\d{2}\/\d{2}\/(?:\d{4}|\d{2})\s+Voy(?:age|aggio)?\.?\s*:?\s*([A-Z0-9./-]+)/gi)].map(m=>({vessel:clean(m[1]).toUpperCase(),voyage:m[2].toUpperCase()}));
  const unique=[...new Map(matches.map(m=>[m.vessel+'|'+m.voyage,m])).values()];
  if(/BOOKING\s+(?:E['’]?|È)\s+INESISTENTE|BOOKING\s+NON\s+TROVAT/i.test(text)&&unique.length===0)return {status:'not_found',message:'Booking inesistente secondo TFG.'};
  if(unique.length!==1)return {status:'unverified',message:'Nave e viaggio non verificabili.'};
  return {status:'found',...unique[0],message:'Nave e viaggio rilevati da TFG; accettazione non confermata.'};
}
function respond(status,data,origin){const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(allowedApiOrigin(origin))h['Access-Control-Allow-Origin']=origin;return new Response(JSON.stringify(data),{status,headers:h});}
addEventListener('fetch',event=>event.respondWith(handle(event.request)));
async function handle(request){const url=new URL(request.url),origin=request.headers.get('Origin');
if(url.pathname==='/health'&&request.method==='GET')return respond(200,{status:'ok',mode:'QA_ONLY',upstream_booking_enabled:true,production_data_access:false},origin);
if(url.pathname==='/diag/tfg-reference'&&request.method==='GET'){
  // Fixed known QA reference only. No arbitrary booking lookup or raw TFG data without auth.
  if(origin!==ORIGIN)return respond(403,{error:'ORIGIN_DENIED'},origin);
  if(!TFG_CLIENT_LIMIT||!TFG_GLOBAL_LIMIT)return respond(503,{error:'RATE_LIMIT_NOT_CONFIGURED'},origin);
  const client=await TFG_CLIENT_LIMIT.limit({key:'reference:'+(request.headers.get('CF-Connecting-IP')||'unknown')});
  const global=await TFG_GLOBAL_LIMIT.limit({key:'all'});
  if(!client.success||!global.success)return respond(429,{error:'RATE_LIMITED'},origin);
  try{
    const result=await publicTfgLookup('280630439');
    return respond(200,{mode:'QA_REFERENCE_DIAGNOSTIC',status:result.status,expected_vessel:/^(?:MV )?SALWEEN$/.test(result.vessel||''),expected_voyage:result.voyage==='646W',booking_authorized:false},origin);
  }catch(error){return respond(503,{mode:'QA_REFERENCE_DIAGNOSTIC',error:'TFG_UPSTREAM_UNAVAILABLE',exception_name:String(error?.name||'unknown').slice(0,40),exception_message:String(error?.message||'unknown').slice(0,100)},origin)}
}
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
if(!allowedApiOrigin(origin))return respond(403,{error:'ORIGIN_DENIED'},origin);
if(request.method==='OPTIONS'){return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'300','Vary':'Origin'}})}
if(request.method!=='POST')return respond(405,{error:'METHOD_DENIED'},origin);
if(!TFG_CLIENT_LIMIT||!TFG_GLOBAL_LIMIT)return respond(503,{error:'RATE_LIMIT_NOT_CONFIGURED'},origin);
const ip=request.headers.get('CF-Connecting-IP')||'unknown';const client=await TFG_CLIENT_LIMIT.limit({key:ip});const global=await TFG_GLOBAL_LIMIT.limit({key:'all'});
if(!client.success||!global.success)return respond(429,{error:'RATE_LIMITED'},origin);
const bearer=request.headers.get('Authorization')||'';
if(!/^Bearer [A-Za-z0-9._-]{50,4096}$/.test(bearer))return respond(401,{error:'SESSION_REQUIRED'},origin);
let verified;try{const res=await fetch(AUTH,{method:'POST',headers:{'Content-Type':'application/json','Authorization':bearer,'Origin':ORIGIN},body:JSON.stringify({action:'session'}),redirect:'manual',signal:AbortSignal.timeout(5000)});if(!res.ok)return respond(res.status===403?403:401,{error:'SESSION_REJECTED'},origin);verified=await res.json()}catch{return respond(503,{error:'QA_AUTH_UNAVAILABLE'},origin)}
if(verified?.active!==true||!verified.user_id||!['driver','admin'].includes(verified.role))return respond(403,{error:'ACCOUNT_DENIED'},origin);
if(verified.role==='admin'&&verified.mfa_verified!==true)return respond(403,{error:'MFA_REQUIRED'},origin);
let payload;try{const raw=await request.text();if(raw.length>512)return respond(413,{error:'PAYLOAD_TOO_LARGE'},origin);payload=JSON.parse(raw)}catch{return respond(400,{error:'INVALID_JSON'},origin)}
if(!payload||Object.keys(payload).length!==1||typeof payload.booking!=='string'||!/^[A-Z0-9][A-Z0-9/-]{3,49}$/.test(payload.booking))return respond(400,{error:'INVALID_BOOKING'},origin);
try{const result=await publicTfgLookup(payload.booking);return respond(200,{...result,source:TFG_SOURCE,checked_at:new Date().toISOString(),booking_authorized:false},origin)}catch{return respond(503,{error:'TFG_UPSTREAM_UNAVAILABLE'},origin)}
}
