/**
 * LTS protected documents API, release only after staged privacy tests.
 * Auth is mandatory on every request, independent of browser navigation.
 * No browser direct access to service_role, tables, or Storage.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {checkLtsSession} from './lts-session.mjs';
import {requireAdminMfa} from './lts-admin-mfa.mjs';

const ORIGIN=(()=>{
 const value=Deno.env.get('LTS_PAYROLL_ALLOWED_ORIGIN')||'https://pasqualemilano0-rgb.github.io';
 let url;
 try{url=new URL(value);}catch{throw Error('LTS payroll origin non valida');}
 if(url.origin!==value||url.protocol!=='https:'||!url.hostname||url.username||url.password)
  throw Error('LTS payroll origin non autorizzata');
 return value;
})();
// Admin operations are enabled ONLY behind authenticated live admin session
// and verified TOTP MFA. No public visitor gains database or Storage access.
// Driver PDF access remains at the existing strictly allowlisted test stage.
const PAYROLL_ADMIN_OPERATIONS_ENABLED=true;
const PAYROLL_ENABLED=Deno.env.get('LTS_PAYROLL_ENABLED')==='yes';
const PAYROLL_PILOT_LIST_ONLY=true;
const BUCKET='lts-payroll-private';
const MAX_FILE=8388608, MAX_MULTIPART=MAX_FILE+32768;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH=/^Bearer ([A-Za-z0-9._-]{50,4096})$/;
const CATEGORIES=new Set(['cedolino','cu','altri']);
const noCache={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
const cors={'Access-Control-Allow-Origin':ORIGIN,...noCache};
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
const fail=(status,message)=>{throw {status,message};};
function key(current,legacy){
 const raw=Deno.env.get(current);
 if(raw)try{const val=JSON.parse(raw);if(typeof val?.default==='string'&&val.default.length>10)return val.default;}catch{}
 return Deno.env.get(legacy)||null;
}
function clients(){
 const url=Deno.env.get('SUPABASE_URL');
 const anon=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!secret)fail(503);
 const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 return {auth:createClient(url,anon,opts),db:createClient(url,secret,opts)};
}
async function boundedBytes(req,max){
 const reader=req.body?.getReader();
 if(!reader)fail(400);
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))fail(413);
 const chunks=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>max){await reader.cancel();fail(413);}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const buf=new Uint8Array(size);let pos=0;
 for(const chunk of chunks){buf.set(chunk,pos);pos+=chunk.byteLength;}
 return buf;
}
async function objectBody(req){
 if((req.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')fail(415);
 try{
  const bytes=await boundedBytes(req,12288);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400);
  return value;
 }catch(e){if(e?.status)throw e;fail(400);}
}
/**
 * Second, independent release gate: verified live LTS users must be manually
 * allowlisted for the limited test. A feature flag alone never admits a user.
 * The database caps entries at two drivers and one admin; entries expire.
 * Query errors fail closed. No client-provided test role or user ID is trusted.
 */
async function requirePhase2Tester(db,userId,role){
 const {data,error}=await db.from('lts_payroll_test_allowlist')
  .select('user_id').eq('user_id',userId).eq('role',role)
  .eq('enabled',true).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error)fail(503,'Accesso test ai documenti non disponibile.');
 if(!data)fail(403,'Documenti non ancora abilitati per questo account.');
}
async function authorized(req,api){
 const match=AUTH.exec(req.headers.get('authorization')||'');
 if(!match)fail(401);
 const {data,error}=await api.auth.auth.getUser(match[1]);
 if(error||!UUID.test(data?.user?.id||''))fail(401);
 const userId=data.user.id;
 const {data:access,error:ae}=await api.db.from('lts_account_access')
  .select('user_id,role,enabled,removed_at').eq('user_id',userId).maybeSingle();
 if(ae)fail(503);
 if(!access||access.enabled!==true||access.removed_at||
   !['driver','admin'].includes(access.role))fail(403);
 const sessionId=await checkLtsSession(api.db,match[1],userId);
 if(access.role==='admin'){
  const mfa=await requireAdminMfa(api.db,match[1],userId);
  if(!mfa?.enrolled||!mfa?.verified)fail(428);
 }
 // Driver accounts remain explicitly allowlisted during rollout. Admin
 // accounts require the existing production admin role and active verified MFA.
 if(access.role==='driver')await requirePhase2Tester(api.db,userId,access.role);
 return {userId,role:access.role,sessionId};
}
function mustAdmin(actor){if(actor.role!=='admin')fail(403);}
function validId(v){if(!UUID.test(v||''))fail(400);return v;}
async function activeDriver(db,id){
 validId(id);
 const {data,error}=await db.from('lts_account_access')
  .select('user_id').eq('user_id',id).eq('role','driver')
  .eq('enabled',true).is('removed_at',null).maybeSingle();
 if(error)fail(503);
 if(!data)fail(404);
 return id;
}
/**
 * Pilot recipient is assigned exclusively through the server-controlled
 * driver_a allowlist slot. Compare the corresponding identity from the LTS
 * directory as a second fail-closed check. Neither the browser nor a name
 * supplied with a request is an authority for document assignment.
 */
async function requireMilanoPasqualeRecipient(db){
 const {data:seat,error:seatError}=await db.from('lts_payroll_test_allowlist')
  .select('user_id').eq('slot','driver_a').eq('role','driver')
  .eq('enabled',true).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(seatError)fail(503,'Autorizzazione del destinatario temporaneamente non verificabile.');
 if(!seat?.user_id)fail(403,'Destinatario di prova non più abilitato.');
 const {data:identity,error:identityError}=await db.from('lts_pending_drivers')
  .select('auth_user_id,first_name,last_name')
  .eq('auth_user_id',seat.user_id).maybeSingle();
 if(identityError)fail(503,'Identità del destinatario temporaneamente non verificabile.');
 const normal=value=>typeof value==='string'?value.trim().toLocaleLowerCase('it'):'';
 if(!identity||normal(identity.first_name)!=='milano'||normal(identity.last_name)!=='pasquale')
  fail(403,'Il destinatario autorizzato non corrisponde a MILANO PASQUALE.');
 return seat.user_id;
}
async function roster(db){
 const {data,error}=await db.from('lts_account_access')
  .select('user_id,phone_e164').eq('role','driver')
  .eq('enabled',true).is('removed_at',null).order('phone_e164').limit(201);
 if(error)fail(503);
 if(data.length>200)fail(413);
 if(!data.length)return [];
 const ids=data.map(x=>x.user_id);
 const {data:names,error:e}=await db.from('lts_pending_drivers')
  .select('auth_user_id,first_name,last_name').in('auth_user_id',ids).limit(201);
 if(e)fail(503);
 const lookup=new Map((names||[]).map(n=>[n.auth_user_id,n]));
 // Administrators can review the whole archive, but may upload/publish
 // exclusively to the verified single test recipient.
 const pilotDriverId=await requireMilanoPasqualeRecipient(db);
 return data.map(x=>({id:x.user_id,
  name:[lookup.get(x.user_id)?.first_name,lookup.get(x.user_id)?.last_name]
   .filter(Boolean).join(' ').trim()||'Autista senza nome',
  phone:x.phone_e164||'',
  documents_enabled:x.user_id===pilotDriverId
 })).sort((a,b)=>a.name.localeCompare(b.name,'it'));
}
async function listDocs(db,actor,q){
 const offset=Number(q.offset??0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail(400);
 let query=db.from('lts_payroll_documents')
  .select('id,driver_id,category,document_year,document_month,label,original_filename,file_size,state,created_at,published_at,first_accessed_at,acknowledged_at')
  .order('created_at',{ascending:false}).range(offset,offset+49);
 if(actor.role==='driver'){
  query=query.eq('driver_id',actor.userId).eq('state','published');
 }else if(q.driverId){
  query=query.eq('driver_id',validId(q.driverId));
 }
 if(q.category){
  if(!CATEGORIES.has(q.category))fail(400);
  query=query.eq('category',q.category);
 }
 if(q.year!==undefined){
  const year=Number(q.year);
  if(!Number.isInteger(year)||year<2000||year>2100)fail(400);
  query=query.eq('document_year',year);
 }
 const {data,error}=await query;
 if(error)fail(503);
 return data||[];
}
async function audit(db,id,actorId,event){
 const {error}=await db.from('lts_payroll_audit').insert({
  document_id:id,actor_id:actorId,event});
 if(error)fail(503);
}
async function upload(req,db,actor){
 mustAdmin(actor);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('multipart/form-data;'))fail(415);
 const bytes=await boundedBytes(req,MAX_MULTIPART);
 let form;
 try{
  form=await new Request(req.url,{method:'POST',headers:{
   'Content-Type':req.headers.get('content-type')||''},body:bytes}).formData();
 }catch{fail(400);}
 const file=form.get('file');
 if(!(file instanceof File)||file.size<10||file.size>MAX_FILE||
    !/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf'))fail(400,'Solo PDF fino a 8 MB.');
 const driverId=await activeDriver(db,String(form.get('driverId')||''));
 // This check runs before reading PDF bytes into memory or touching Storage.
 if(driverId!==await requireMilanoPasqualeRecipient(db))
  fail(403,'Caricamento PDF consentito soltanto per MILANO PASQUALE.');
 const category=String(form.get('category')||'');
 const year=Number(form.get('year'));
 const rawMonth=String(form.get('month')||'');
 const month=rawMonth===''?null:Number(rawMonth);
 const label=String(form.get('label')||'').trim();
 if(!CATEGORIES.has(category)||!Number.isInteger(year)||year<2000||year>2100||
  (month!==null&&(!Number.isInteger(month)||month<1||month>12))||
  (category==='cedolino'&&month===null)||!label||label.length>160)fail(400);
 const originalName=file.name.replace(/[\r\n\x00-\x1f]/g,'_').slice(0,180);
 const buffer=new Uint8Array(await file.arrayBuffer());
 if(String.fromCharCode(...buffer.slice(0,5))!=='%PDF-')fail(400,'File PDF non valido.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)))
  .map(x=>x.toString(16).padStart(2,'0')).join('');
 const {data:duplicate,error:dupErr}=await db.from('lts_payroll_documents')
  .select('id').eq('driver_id',driverId).eq('sha256_hex',hash).eq('document_year',year)
  .neq('state','archived').limit(1);
 if(dupErr)fail(503);
 if(duplicate?.length)fail(409,'Questo PDF risulta già caricato per il dipendente.');
 const id=crypto.randomUUID(),path=driverId+'/'+year+'/'+id+'.pdf';
 const storage=db.storage.from(BUCKET);
 const {error:putErr}=await storage.upload(path,buffer,{contentType:'application/pdf',upsert:false,cacheControl:'0'});
 if(putErr)fail(503,'Caricamento PDF non riuscito.');
 const {data:created,error:writeErr}=await db.from('lts_payroll_documents').insert({
  id,driver_id:driverId,uploaded_by:actor.userId,category,
  document_year:year,document_month:month,label,
  original_filename:originalName,object_path:path,file_size:file.size,
  sha256_hex:hash,state:'draft'
 }).select('id').single();
 if(writeErr||!created){await storage.remove([path]);fail(503,'Documento non registrato.');}
 // Audit inserted atomically by lts_payroll_write_audit trigger.
 return {id,state:'draft'};
}
async function publish(db,actor,id){
 mustAdmin(actor);validId(id);
 const {data:doc,error:findErr}=await db.from('lts_payroll_documents')
  .select('id,driver_id,state').eq('id',id).maybeSingle();
 if(findErr)fail(503);
 if(!doc||doc.state!=='draft')fail(409,'Documento non pubblicabile.');
 await activeDriver(db,doc.driver_id);
 // The only permissible publication recipient is the same pilot driver.
 // Legacy drafts for another driver must not bypass the current policy.
 if(doc.driver_id!==await requireMilanoPasqualeRecipient(db))
  fail(403,'Pubblicazione riservata a MILANO PASQUALE.');
 await requirePhase2Tester(db,doc.driver_id,'driver');
 const {data,error}=await db.from('lts_payroll_documents')
  .update({state:'published',published_by:actor.userId,published_at:new Date().toISOString()})
  .eq('id',id).eq('state','draft').select('id').maybeSingle();
 if(error)fail(503);
 if(!data)fail(409);
 // Audit inserted atomically by lts_payroll_write_audit trigger.
 return {id,state:'published'};
}
async function revokeDocument(db,actor,id){
 mustAdmin(actor);validId(id);
 const {data,error}=await db.rpc('lts_payroll_revoke',{p_document_id:id,p_actor_id:actor.userId});
 if(error)fail(503,'Revoca non registrata.');
 if(!data)fail(409,'Documento non revocabile.');
 return {id,state:'archived'};
}
async function download(db,actor,id){
 validId(id);
 const {data,error}=await db.from('lts_payroll_documents')
  .select('id,driver_id,object_path,state,category,acknowledged_at').eq('id',id).maybeSingle();
 if(error)fail(503);
 if(!data)fail(404);
 if(actor.role==='driver'&&(data.driver_id!==actor.userId||data.state!=='published'))fail(403);
 if(actor.role==='admin'&&data.state==='archived')fail(403);
 // Owner + published status are checked above. A cedolino PDF cannot leave
 // this API before explicit confirmation, even if the browser skips its UI.
 if(actor.role==='driver'&&data.category==='cedolino'&&!data.acknowledged_at)
  fail(409,'Conferma prima la messa a disposizione del cedolino per aprire il PDF.');
 if(!data.object_path.startsWith(data.driver_id+'/'))fail(503);
 const {data:file,error:readErr}=await db.storage.from(BUCKET).download(data.object_path);
 if(readErr||!file)fail(503,'PDF non disponibile.');
 if(actor.role==='driver'){
  // Mark first PDF access only AFTER the file is fetched. The restricted
  // RPC rechecks owner, published state and prior cedolino confirmation.
  // It also rejects a concurrent revoke; no bytes are returned on failure.
  const {data:at,error:accessError}=await db.rpc('lts_payroll_mark_first_access',{
   p_document_id:id,p_driver_id:actor.userId
  });
  if(accessError)fail(503,'Impossibile registrare l’accesso al PDF.');
  if(!at)fail(409,'Documento non più disponibile.');
 }
 await audit(db,id,actor.userId,'download');
 return new Response(file,{status:200,headers:{...cors,'Content-Type':'application/pdf',
  'Content-Disposition':'attachment; filename="LTS-documento.pdf"',
  'Content-Security-Policy':'sandbox'}});
}
/** Explicit pre-PDF acknowledgement of availability, NOT proof of viewing,
 * wage payment, correct amounts, or contractual acceptance. */
async function acknowledge(db,actor,id){
 if(actor.role!=='driver')fail(403);
 validId(id);
 const {data:at,error}=await db.rpc('lts_payroll_acknowledge',{
  p_document_id:id,p_driver_id:actor.userId
 });
 if(error)fail(503,'Conferma non registrata. Riprova.');
 if(!at)fail(409,'Cedolino non disponibile o non assegnato a questo autista.');
 return {id,acknowledgedAt:at};
}
Deno.serve(async req=>{
 // Preview requests still enforce exact CORS, live JWT, session and the
 // server-side expiring allowlist before returning any metadata.
 if(req.headers.get('origin')!==ORIGIN)return json({error:'Origine non autorizzata.'},403);
 if(req.method==='OPTIONS'){
  const method=req.headers.get('access-control-request-method');
  const headers=(req.headers.get('access-control-request-headers')||'')
   .toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(method!=='POST'||headers.some(x=>!['authorization','content-type'].includes(x)))
   return json({error:'Richiesta CORS non consentita.'},403);
  return new Response(null,{status:204,headers:{...cors,
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'Authorization, Content-Type',
   'Access-Control-Max-Age':'600'}});
 }
 if(req.method!=='POST')return json({error:'Metodo non consentito.'},405);
 try{
  const api=clients(),actor=await authorized(req,api);
  if((req.headers.get('content-type')||'').startsWith('multipart/form-data;')){
   if(!PAYROLL_ADMIN_OPERATIONS_ENABLED||actor.role!=='admin')
    fail(403,'Caricamento riservato all’amministratore con MFA.');
   return json(await upload(req,api.db,actor),201);
  }
  const input=await objectBody(req);
  // Administrative actions are operational with verified MFA. Other drivers
  // cannot access private PDFs beyond the existing read-only pilot.
  if(actor.role==='admin'&&!PAYROLL_ADMIN_OPERATIONS_ENABLED)
   fail(503,'Area amministrativa non attiva.');
  if(actor.role==='driver'&&(PAYROLL_PILOT_LIST_ONLY||!PAYROLL_ENABLED)&&input.action!=='list')
   fail(503,'Apertura PDF non ancora attiva per gli autisti.');
  // Every driver operation is authorized by the verified, live LTS session.
  // Document ownership, published-only access and admin MFA remain enforced
  // server-side, independently of any browser controls.
  if(input.action==='drivers'){
   mustAdmin(actor);
   return json({drivers:await roster(api.db)});
  }
  if(input.action==='list')return json({documents:await listDocs(api.db,actor,input)});
  if(input.action==='publish')return json(await publish(api.db,actor,input.id));
  if(input.action==='revoke')return json(await revokeDocument(api.db,actor,input.id));
  if(input.action==='download')return await download(api.db,actor,input.id);
  if(input.action==='acknowledge')return json(await acknowledge(api.db,actor,input.id));
  fail(400);
 }catch(e){
  const status=[400,401,403,404,409,413,415,428,429,503].includes(e?.status)?e.status:503;
  const messages={400:'Richiesta non valida.',401:'Effettua nuovamente l’accesso.',
   403:'Accesso non autorizzato.',404:'Documento o autista non disponibile.',
   409:'Documento già presente o modificato.',413:'File troppo grande.',
   415:'Formato non supportato.',428:'MFA amministratore richiesta.',429:'Troppi tentativi di attivazione. Riprova più tardi.',
   503:'Servizio documenti temporaneamente non disponibile.'};
  return json({error:e?.message||messages[status]},status);
 }
});
