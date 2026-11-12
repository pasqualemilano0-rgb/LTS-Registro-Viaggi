// LTS public uptime monitor, parity with scripts/lts_health_monitor.py.
// Read-only probes; no sessions, JWTs, API keys, credentials, or login attempts.
const SITE='https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const CHECKS=Object.freeze([
  {name:'site',url:SITE,method:'GET',type:'text/html',markers:['id="app"','<title>LTS']},
  {name:'admin',url:SITE+'amministratore/',method:'GET',type:'text/html',markers:['id="login-panel"','<title>LTS']},
  {name:'bundle',url:SITE+'app.mjs',method:'GET',type:'',markers:['import ']},
  {name:'auth',url:'https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth',method:'OPTIONS',type:'',markers:[]},
]);
const MAX_BODY_BYTES=250000;

async function readBounded(response){
  if(!response.body) return '';
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let length=0, text='';
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done) break;
      length+=value.byteLength;
      if(length>MAX_BODY_BYTES) throw Error('BODY_TOO_LARGE');
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }finally{reader.releaseLock()}
}
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin}catch{return false}}
async function inspectOne(item,fetcher){
  const headers={'User-Agent':'LTS-Public-Health-Monitor/2.0','Cache-Control':'no-cache'};
  if(item.method==='OPTIONS'){
    headers.Origin=ORIGIN;
    headers['Access-Control-Request-Method']='POST';
  }
  let failure='UNVERIFIED';
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetcher(item.url,{method:item.method,headers,redirect:'follow',signal:AbortSignal.timeout(18000)});
      if(!sameOrigin(response.url,item.url)) throw Error('UNEXPECTED_REDIRECT_ORIGIN');
      if(response.status!==(item.method==='OPTIONS'?204:200)) throw Error('HTTP_STATUS_'+response.status);
      if(item.method==='OPTIONS'){
        if(response.headers.get('access-control-allow-origin')!==ORIGIN) throw Error('AUTH_CORS_ORIGIN_MISMATCH');
      }else{
        if(item.type&&!response.headers.get('content-type')?.toLowerCase().includes(item.type)) throw Error('CONTENT_TYPE_MISMATCH');
        const body=await readBounded(response);
        if(item.markers.some(marker=>!body.includes(marker))) throw Error('MISSING_REQUIRED_MARKER');
      }
      return{name:item.name,ok:true};
    }catch(error){failure=error instanceof Error&&/^(UNEXPECTED_REDIRECT_ORIGIN|HTTP_STATUS_\d+|AUTH_CORS_ORIGIN_MISMATCH|CONTENT_TYPE_MISMATCH|BODY_TOO_LARGE|MISSING_REQUIRED_MARKER)$/.test(error.message)?error.message:'NETWORK_OR_TIMEOUT';}
    if(attempt===0) await new Promise(resolve=>setTimeout(resolve,2000));
  }
  return{name:item.name,ok:false,reason:failure};
}
export async function inspect(fetcher=fetch){return Promise.all(CHECKS.map(item=>inspectOne(item,fetcher)))}
export default {
  async scheduled(_event,_env,ctx){
    ctx.waitUntil(inspect().then(results=>{
      const failed=results.filter(x=>!x.ok);
      if(failed.length) console.error('LTS_MONITOR_FAIL',JSON.stringify(failed));
      else console.log('LTS_MONITOR_OK',JSON.stringify({checked:results.map(x=>x.name)}));
    }).catch(()=>console.error('LTS_MONITOR_FAIL',JSON.stringify([{name:'monitor',reason:'UNEXPECTED_RUNTIME_ERROR'}]))));
  },
  async fetch(){return new Response('Not found',{status:404})},
};
