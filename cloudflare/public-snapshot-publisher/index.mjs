// Public-only LTS port schedules: validated KV -> one atomic non-force GitHub commit.
// Activation requires BOTH PUBLISH_ENABLED="yes" and a narrowly scoped secret.
// No bookings, driver records, personal information, uploads, secrets or deploy actions.
export const FEEDS=Object.freeze({
  cnt:{filename:'conateco.json',source:'https://api.conateco.it/ConatecoServicesApi/BerthForecast',
    fields:['vessel','voyage','eta','vessel_status','category','voyage_id','carrier','acceptance_flag','acceptance_icon','stop_cargo','external_depot','opening','closing','notes','source_conflict']},
  tfg:{filename:'tfg_schedule.json',source:'https://tfg.bucci.it/@/TFGW_TP_ETA',
    fields:['vessel','arrival_voyage','departure_voyage','eta','acceptance','custom_close_time','fast_corridor_cut_off','gate_cut_off','destination']},
  sct:{filename:'sct.json',source:'https://www.salernocontainerterminal.com/ca/an/vessel_schedule.php',
    fields:['vessel','voyage','eta','closing','acceptance_dry','acceptance_reef','status']}
});
export const BASE='https://api.github.com/repos/pasqualemilano0-rgb/LTS-Registro-Viaggi';
const MAX_BYTES=500000,MAX_AGE_MS=45*60000,MAX_FUTURE_MS=5*60000;
const ROOT=new Set(['source','acquired_at','source_updated_at','rows','updated_at','data_changed_at','monitor_origin','live','booking_verified']);
const SHA=/^[a-f0-9]{40}$/;
export class PublishRejected extends Error { constructor(code){super(code);this.name='PublishRejected';} }
function requireTrue(test,code){if(!test)throw new PublishRejected(code);}
function time(value,code){
  requireTrue(typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value),code);
  const n=Date.parse(value);requireTrue(Number.isFinite(n),code);return n;
}
function safeFields(value,allowed,code){
  requireTrue(value && typeof value==='object'&&!Array.isArray(value),code);
  requireTrue(Object.keys(value).every(k=>allowed.has(k)),code);
}
function safeRows(rows,spec){
  requireTrue(Array.isArray(rows)&&rows.length>=1&&rows.length<=2000,'INVALID_ROWS');
  const allowed=new Set(spec.fields);
  for(const row of rows){
    safeFields(row,allowed,'UNEXPECTED_PUBLIC_FIELD');
    requireTrue(typeof row.vessel==='string'&&row.vessel.trim().length>0,'INVALID_VESSEL');
    for(const value of Object.values(row)){
      requireTrue(value===null||typeof value==='string'||typeof value==='boolean'||
        (typeof value==='number'&&Number.isFinite(value)),'PRIVATE_OR_NESTED_VALUE');
      requireTrue(typeof value!=='string'||value.length<=500,'OVERSIZE_FIELD');
    }
  }
}
export function vet(terminal,snapshot,status,previous,now=Date.now()){
  const spec=FEEDS[terminal];requireTrue(!!spec,'UNKNOWN_TERMINAL');
  safeFields(snapshot,ROOT,'UNEXPECTED_SNAPSHOT_FIELD');
  requireTrue(snapshot.source===spec.source&&snapshot.monitor_origin==='cloudflare_official_read','UNVERIFIED_SOURCE');
  safeFields(status,new Set(['state','last_error_code','last_attempt_at','last_success_at','source_updated_at','rows']),'INVALID_STATUS');
  requireTrue(status.state==='ok'&&status.last_error_code===null,'UNHEALTHY_TERMINAL');
  const acquired=time(snapshot.acquired_at,'INVALID_ACQUIRED_AT');
  requireTrue(acquired>=now-MAX_AGE_MS&&acquired<=now+MAX_FUTURE_MS,'STALE_OR_FUTURE');
  requireTrue(time(status.last_success_at,'INVALID_MONITOR_TIME')===acquired,'MONITOR_MISMATCH');
  safeRows(snapshot.rows,spec);
  requireTrue(snapshot.rows.length===status.rows,'ROW_COUNT_MISMATCH');
  if(snapshot.booking_verified!==undefined)requireTrue(snapshot.booking_verified===false,'BOOKING_DATA_NOT_PUBLIC');
  const updated=snapshot.source_updated_at;
  if(terminal==='tfg')requireTrue(typeof updated==='string'&&updated.length>0,'TFG_UPDATE_MISSING');
  if(updated!==undefined&&updated!==null)requireTrue(time(updated,'BAD_SOURCE_UPDATED')<=now+MAX_FUTURE_MS,'FUTURE_SOURCE_UPDATE');
  if(status.source_updated_at!==undefined)requireTrue(status.source_updated_at===(updated??null),'SOURCE_VERSION_MISMATCH');
  if(previous!==null){
    safeFields(previous,new Set(['source','source_updated_at','rows','acquired_at','updated_at','data_changed_at']),'BAD_PREVIOUS_ROOT');
    requireTrue(previous.source===spec.source,'PREVIOUS_SOURCE_MISMATCH');
    safeRows(previous.rows,spec);
    const old=time(previous.acquired_at,'BAD_PREVIOUS_TIME');
    requireTrue(acquired>=old,'ACQUISITION_ROLLBACK');
    requireTrue(previous.rows.length<4 || snapshot.rows.length>=Math.max(2,Math.floor(previous.rows.length/2)),'UNEXPECTED_ROW_LOSS');
    if(terminal==='tfg'&&previous.source_updated_at)requireTrue(time(updated,'BAD_TFG_VERSION')>=time(previous.source_updated_at,'BAD_OLD_TFG_VERSION'),'TFG_VERSION_ROLLBACK');
  }
  const result={source:spec.source,source_updated_at:updated??null,acquired_at:snapshot.acquired_at,rows:snapshot.rows};
  if(terminal==='sct'){
    for(const k of ['updated_at','data_changed_at'])if(snapshot[k]!=null){
      time(snapshot[k],'INVALID_SCT_TIMESTAMP');result[k]=snapshot[k];
    }
  }
  const body=JSON.stringify(result,null,2)+'\n';
  requireTrue(new TextEncoder().encode(body).length<=MAX_BYTES,'OVERSIZED_PUBLIC_SNAPSHOT');
  return{body,acquired,rows:result.rows.length,changed:!previous||acquired>time(previous.acquired_at,'BAD_PREVIOUS_TIME')};
}
export async function readAll(env,now=Date.now(),previous={}){
  requireTrue(env&&env.SCHEDULES_KV&&typeof env.SCHEDULES_KV.get==='function'&&typeof env.SCHEDULES_KV.list==='function','KV_UNAVAILABLE');
  const output={};
  for(const terminal of Object.keys(FEEDS)){
    const [snapshot,status,backups]=await Promise.all([
      env.SCHEDULES_KV.get('schedule:'+terminal,'json'),
      env.SCHEDULES_KV.get('status:'+terminal,'json'),
      env.SCHEDULES_KV.list({prefix:'backup:v1:'+terminal+':',limit:1})
    ]);
    requireTrue(Array.isArray(backups?.keys)&&backups.keys.length>0,'RECOVERY_POINT_MISSING_'+terminal);
    output[terminal]=vet(terminal,snapshot,status,previous[terminal]??null,now);
  }
  return output;
}
async function github(path,{method='GET',body,token,fetcher=fetch}={}){
  requireTrue(path.startsWith('/git/')||path.startsWith('/contents/'),'UNEXPECTED_GITHUB_ROUTE');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  try{
    const headers={'Accept':'application/vnd.github+json','User-Agent':'LTS-Porti-Snapshot-Publisher/1.0',
      'X-GitHub-Api-Version':'2022-11-28'};
    if(token)headers.Authorization='Bearer '+token;
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetcher(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
      redirect:'manual',signal:controller.signal});
    requireTrue(response.ok&&!response.redirected&&response.status<300,'GITHUB_'+method+'_HTTP_'+response.status);
    const size=Number(response.headers?.get?.('Content-Length')||0);
    requireTrue(size<=2000000,'GITHUB_RESPONSE_OVERSIZED');
    const raw=await response.text();
    requireTrue(raw.length<=2000000,'GITHUB_RESPONSE_OVERSIZED');
    return JSON.parse(raw);
  }catch(e){
    if(e instanceof PublishRejected)throw e;
    throw new PublishRejected('GITHUB_UNAVAILABLE_OR_INVALID_JSON');
  }finally{clearTimeout(timer);}
}
function decodeBlob(o){
  requireTrue(o?.encoding==='base64'&&typeof o.content==='string','GITHUB_BASE64_EXPECTED');
  const bytes=Uint8Array.from(atob(o.content.replace(/\s/g,'')),ch=>ch.charCodeAt(0));
  requireTrue(bytes.length<=MAX_BYTES,'PREVIOUS_SNAPSHOT_OVERSIZED');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new PublishRejected('PREVIOUS_SNAPSHOT_CORRUPT');}
}
async function readBaseline(fetcher,token){
  const ref=await github('/git/ref/heads/main',{token,fetcher});
  const parent=ref?.object?.sha;requireTrue(SHA.test(parent),'BAD_MAIN_REF');
  const commit=await github('/git/commits/'+parent,{token,fetcher});
  requireTrue(SHA.test(commit?.tree?.sha),'BAD_BASE_TREE');
  const old={};
  for(const [terminal,spec] of Object.entries(FEEDS)){
    const data=await github('/contents/porti/data/'+spec.filename+'?ref='+parent,{token,fetcher});
    old[terminal]=decodeBlob(data);
  }
  return{parent,treeSha:commit.tree.sha,old};
}
export async function preview(env,{now=Date.now(),fetcher=fetch}={}){
  const {parent,old}=await readBaseline(fetcher);
  const vetted=await readAll(env,now,old);
  return{status:'ready',mode:'read_only',parent,updated:Object.keys(vetted).filter(t=>vetted[t].changed),
    terminals:Object.fromEntries(Object.entries(vetted).map(([t,v])=>[t,{rows:v.rows,acquired_at:new Date(v.acquired).toISOString()}]))};
}
export async function publish(env,{now=Date.now(),fetcher=fetch}={}){
  // This check is deliberately ahead of ALL external requests and KV access.
  requireTrue(env?.PUBLISH_ENABLED==='yes'&&typeof env.GITHUB_PUBLIC_CONTENTS_TOKEN==='string'&&
    env.GITHUB_PUBLIC_CONTENTS_TOKEN.length>=20,'PUBLISH_DISABLED_OR_SECRET_MISSING');
  const token=env.GITHUB_PUBLIC_CONTENTS_TOKEN;
  const {parent,treeSha,old}=await readBaseline(fetcher,token);
  const vetted=await readAll(env,now,old); // validate ALL before creating any Git object
  const updated=Object.keys(vetted).filter(t=>vetted[t].changed);
  if(!updated.length)return{status:'unchanged',updated:[],parent};
  const tree=[];
  for(const terminal of updated){
    const r=await github('/git/blobs',{method:'POST',body:{content:vetted[terminal].body,encoding:'utf-8'},token,fetcher});
    requireTrue(SHA.test(r?.sha),'INVALID_GIT_BLOB');
    tree.push({path:'porti/data/'+FEEDS[terminal].filename,mode:'100644',type:'blob',sha:r.sha});
  }
  const newTree=await github('/git/trees',{method:'POST',body:{base_tree:treeSha,tree},token,fetcher});
  requireTrue(SHA.test(newTree?.sha),'INVALID_GIT_TREE');
  const message='data(porti): publish verified Cloudflare vessel schedules (no Actions)';
  const next=await github('/git/commits',{method:'POST',body:{message,tree:newTree.sha,parents:[parent]},token,fetcher});
  requireTrue(SHA.test(next?.sha),'INVALID_GIT_COMMIT');
  await github('/git/refs/heads/main',{method:'PATCH',body:{sha:next.sha,force:false},token,fetcher});
  return{status:'published',updated,parent,commit:next.sha};
}
export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method!=='GET'||!['/health','/preview'].includes(url.pathname))return new Response('Not found',{status:404});
    if(url.pathname==='/preview'&&(env?.PUBLISH_ENABLED==='yes'||env?.QA_PREVIEW_ENABLED!=='yes'))return new Response('Not found',{status:404});
    try{
      const result=url.pathname==='/preview'?await preview(env):await readAll(env);
      const body=url.pathname==='/preview'?result:{status:'ok',mode:'read_only',publishing_enabled:env?.PUBLISH_ENABLED==='yes',
        terminals:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,{rows:v.rows,acquired_at:new Date(v.acquired).toISOString()}]))};
      return new Response(JSON.stringify(body),
        {headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    }catch(e){return new Response(JSON.stringify({status:'blocked',reason:e instanceof PublishRejected?e.message:'CHECK_FAILED'}),
      {status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(publish(env).then(result=>console.log(JSON.stringify({event:'PUBLIC_PORTI_PUBLISH',status:result.status,terminals:result.updated})))
      .catch(error=>{console.error('PUBLIC_PORTI_PUBLISH_ERROR',error instanceof PublishRejected?error.message:'UNEXPECTED_FAILURE');throw error;}));
  }
};
