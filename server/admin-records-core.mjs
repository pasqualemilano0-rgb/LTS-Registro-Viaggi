/** Server-only LTS administrator archive controller.
 * Authorizes every request using Supabase Auth, live session and enrolled MFA.
 * Driver account archives are read by verified admin only; writes are atomic,
 * revision-bound, validated and audited. Do not expose this module to the UI.
 */
import {validateState,emptyState} from './domain.mjs';
import {applyAdminRecordEdit} from './admin-record-operations.mjs';
import {checkLtsSession} from './lts-session.mjs';
import {requireAdminMfa} from './lts-admin-mfa.mjs';

const ORIGIN='https://pasqualemilano0-rgb.github.io';
const AUTH=/^Bearer ([A-Za-z0-9._-]{50,4096})$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const REQUEST=/^[a-zA-Z0-9_-]{8,100}$/;
const MAX_BYTES=30000;
const headers=origin=>({
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private,no-store','Vary':'Origin',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 ...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})
});
const json=(data,status,origin)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
async function body(req){
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))throw {status:413};
 if(!req.body)throw {status:400};
 const reader=req.body.getReader(),parts=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw {status:413};}
   parts.push(value);
  }
 }finally{reader.releaseLock();}
 const buf=new Uint8Array(size);let pos=0;
 for(const part of parts){buf.set(part,pos);pos+=part.byteLength;}
 try{
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));
  if(!value||typeof value!=='object'||Array.isArray(value))throw 0;
  return value;
 }catch{throw {status:400};}
}
async function authorized(req,clients){
 const match=AUTH.exec(req.headers.get('Authorization')||'');
 if(!match)throw {status:401};
 const {data,error}=await clients.public.auth.getUser(match[1]);
 if(error||!UUID.test(data?.user?.id||''))throw {status:401};
 const userId=data.user.id;
 const {data:access,error:ae}=await clients.admin.from('lts_account_access')
  .select('user_id,role,enabled,removed_at').eq('user_id',userId).maybeSingle();
 if(ae)throw {status:503};
 if(!access||access.user_id!==userId||access.role!=='admin'||access.enabled!==true||
    access.removed_at)throw {status:403};
 await checkLtsSession(clients.admin,match[1],userId);
 const mfa=await requireAdminMfa(clients.admin,match[1],userId);
 if(mfa?.enrolled!==true||mfa?.verified!==true)throw {status:428};
 return userId;
}
async function checkDriver(admin,userId){
 if(!UUID.test(userId||''))throw {status:400};
 const {data,error}=await admin.from('lts_account_access')
  .select('user_id,role').eq('user_id',userId).maybeSingle();
 if(error)throw {status:503};
 if(!data||data.role!=='driver')throw {status:404};
}
async function archive(admin,driverId){
 const {data,error}=await admin.from('lts_account_archives')
  .select('revision,payload,updated_at').eq('user_id',driverId).maybeSingle();
 if(error)throw {status:503};
 if(!data)return null;
 if(!Number.isSafeInteger(data.revision)||data.revision<0)throw {status:503};
 let state;
 try{state=validateState(data.payload);}catch{throw {status:503};}
 return {revision:data.revision,state,updatedAt:data.updated_at};
}
async function drivers(admin){
 const {data:accounts,error}=await admin.from('lts_account_access')
  .select('user_id,phone_e164,enabled,removed_at').eq('role','driver').limit(201);
 if(error)throw {status:503};
 if(accounts.length>200)throw {status:413};
 const ids=accounts.map(x=>x.user_id);
 if(!ids.length)return [];
 const [names,archives]=await Promise.all([
  admin.from('lts_pending_drivers').select('auth_user_id,first_name,last_name')
   .in('auth_user_id',ids).limit(201),
  admin.from('lts_account_archives').select('user_id,revision,updated_at,payload')
   .in('user_id',ids).limit(201)
 ]);
 if(names.error||archives.error)throw {status:503};
 const byName=new Map((names.data||[]).map(n=>[n.auth_user_id,n]));
 const byArchive=new Map((archives.data||[]).map(a=>[a.user_id,a]));
 return accounts.map(account=>{
  const label=byName.get(account.user_id),record=byArchive.get(account.user_id);
  // Count only validated snapshots. Never treat a malformed archive as empty.
  let profile=null,counts=null;
  try{
   if(record){
    const state=validateState(record.payload);
    profile=state.profile;
    counts={trips:state.trips.length,customers:state.customers.length,
      legacyTariffs:state.tariffs.length};
   }
  }catch{}
  return {id:account.user_id,phone:account.phone_e164,
   name:[label?.first_name||profile?.firstName,label?.last_name||profile?.lastName]
    .filter(Boolean).join(' ').trim()||'Autista senza nome',
   status:account.removed_at?'removed':account.enabled?'active':'disabled',
   revision:record?.revision??null,updatedAt:record?.updated_at??null,counts};
 }).sort((a,b)=>a.name.localeCompare(b.name,'it'));
}
async function auditRows(admin,driverId){
 const {data,error}=await admin.from('lts_admin_archive_audit')
  .select('id,created_at,category,action,record_id,reason,previous_revision,new_revision')
  .eq('driver_id',driverId).order('created_at',{ascending:false}).limit(40);
 if(error)throw {status:503};
 return (data||[]).map(a=>({id:a.id,at:a.created_at,category:a.category,
  action:a.action,recordId:a.record_id,reason:a.reason,
  beforeRevision:a.previous_revision,afterRevision:a.new_revision}));
}
async function mutate(admin,actorId,input){
 const driverId=input.driverId;
 await checkDriver(admin,driverId);
 const current=await archive(admin,driverId);
 if(!current)throw {status:409,error:'L’archivio non è ancora stato sincronizzato dall’autista.'};
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==current.revision)
  throw {status:409,error:'L’archivio è cambiato. Aggiorna prima di salvare.'};
 if(!REQUEST.test(input.requestId||''))throw {status:400};
 const operation=input.operation,category=input.category,id=input.recordId;
 // Explicit opt-in only, authorized with the same admin MFA and revision CAS.
 if(input.updateLinkedTrips!==undefined&&typeof input.updateLinkedTrips!=='boolean')
  throw {status:400,error:'Conferma aggiornamento viaggi non valida.'};
 const updateLinkedTrips=input.updateLinkedTrips===true;
 if(updateLinkedTrips&&(operation!=='update'||category!=='customer'))
  throw {status:400,error:'Aggiornamento viaggi consentito solo modificando un cliente.'};
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length>500||(operation==='delete'&&reason.length<8))
  throw {status:400,error:'Per eliminare un elemento inserisci una motivazione di almeno 8 caratteri.'};
 let restored=null;
 if(operation==='restore'){
  if(!UUID.test(input.auditId||''))throw {status:400};
  const {data:entry,error:e}=await admin.from('lts_admin_archive_audit')
   .select('category,action,record_id,before_record')
   .eq('id',input.auditId).eq('driver_id',driverId).maybeSingle();
  if(e)throw {status:503};
  if(!entry||entry.action!=='delete'||entry.category!==category||
     entry.record_id!==id||!entry.before_record)throw {status:409};
  restored=entry.before_record;
 }
 let patched;
 try{patched=applyAdminRecordEdit(current.state,{
  action:operation,category,id,patch:input.patch||{},restoreRecord:restored,updateLinkedTrips
 });}catch(error){throw {status:400,error:error.message||'Dati da modificare non validi.'};}
 const auditDetails=[
  ...(updateLinkedTrips&&patched.affectedTrips>0?
   ['Modificati '+patched.affectedTrips+' viaggi collegati']:[]),
  ...(patched.preservedLegacyTariffs>0?
   [patched.preservedLegacyTariffs+' tariffe storiche conservate separate']:[])
 ];
 const auditReason=[reason,...auditDetails].filter(Boolean).join(' · ');
 if(auditReason.length>500)throw {status:400,error:'Motivo della modifica troppo lungo.'};
 const {data,error}=await admin.rpc('lts_admin_archive_commit',{
  p_actor_id:actorId,p_driver_id:driverId,p_expected_revision:current.revision,
  p_new_payload:patched.state,p_request_id:input.requestId,p_category:category,
  p_action:operation,p_record_id:id,p_reason:auditReason,
  p_before:patched.before??null,p_after:patched.after??null
 });
 if(error){
  if(['40001','23505'].includes(error.code))throw {status:409,error:'L’archivio è cambiato durante il salvataggio. Aggiorna e ricontrolla.'};
  if(error.code==='22023')throw {status:400};
  if(error.code==='42501')throw {status:403};
  throw {status:503};
 }
 if(!Number.isSafeInteger(data)||data!==current.revision+1)throw {status:503};
 return {revision:data,state:patched.state,affectedTrips:patched.affectedTrips||0,
  preservedLegacyTariffs:patched.preservedLegacyTariffs||0};
}
export async function handleAdminRecords(req,{getClients}={}){
 const origin=req.headers.get('Origin');
 if(origin!==ORIGIN)return json({error:'Origine non autorizzata.'},403,origin);
 if(req.method==='OPTIONS'){
  const method=req.headers.get('Access-Control-Request-Method');
  const ask=(req.headers.get('Access-Control-Request-Headers')||'').toLowerCase()
   .split(',').map(x=>x.trim()).filter(Boolean);
  if(method!=='POST'||ask.some(x=>!['authorization','content-type'].includes(x)))
   return json({error:'Richiesta CORS non autorizzata.'},403,origin);
  return new Response(null,{status:204,headers:{
   'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'Authorization, Content-Type',
   'Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  }});
 }
 if(req.method!=='POST')return json({error:'Metodo non consentito.'},405,origin);
 if((req.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return json({error:'Formato non valido.'},415,origin);
 try{
  const clients=getClients?.();
  if(!clients?.public||!clients?.admin)throw {status:503};
  const actor=await authorized(req,clients);
  const input=await body(req);
  if(input.action==='list')return json({drivers:await drivers(clients.admin)},200,origin);
  await checkDriver(clients.admin,input.driverId);
  if(input.action==='read'){
   const data=await archive(clients.admin,input.driverId);
   return json({archive:data,audit:await auditRows(clients.admin,input.driverId)},200,origin);
  }
  if(input.action==='mutate'){
   const result=await mutate(clients.admin,actor,input);
   return json({...result,audit:await auditRows(clients.admin,input.driverId)},200,origin);
  }
  throw {status:400};
 }catch(e){
  const status=[400,401,403,404,409,413,415,428,503].includes(e?.status)?e.status:503;
  const errors={400:'Richiesta non valida.',401:'Accedi nuovamente.',403:'Solo amministratore.',
   404:'Autista non trovato.',409:'Archivio modificato: aggiorna prima di salvare.',
   413:'Dati troppo grandi.',415:'Formato non valido.',428:'Conferma MFA richiesta.',
   503:'Gestione archivi temporaneamente non disponibile.'};
  return json({error:e?.error||errors[status]},status,origin);
 }
}
