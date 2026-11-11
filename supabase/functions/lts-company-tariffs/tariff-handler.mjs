/** Authorized company tariff catalog. No direct archive writes or private trip exposure. */
import {checkLtsSession} from './lts-session.mjs';
import {requireAdminMfa} from './lts-admin-mfa.mjs';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const TOKEN=/^Bearer ([A-Za-z0-9._-]{50,4096})$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 Pragma:'no-cache',Vary:'Origin','X-Content-Type-Options':'nosniff'};
const send=(body,status,origin)=>new Response(JSON.stringify(body),{status,headers:{
 ...HEAD,...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})}});
function normalize(value,field,minimum=1){
 if(typeof value!=='string'||value.length>500||/[\u0000-\u001f\u007f]/u.test(value))
  throw {status:422,error:field+' non valido.'};
 const text=value.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
 if(text.length<minimum||text.length>500)throw {status:422,error:field+' non valido.'};
 return text;
}
async function body(req){
 const max=2048,header=req.headers.get('content-length');
 if(header!==null&&(!/^\d+$/.test(header)||Number(header)>max))throw {status:413};
 const reader=req.body?.getReader();if(!reader)throw {status:400};
 const parts=[];let n=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;
  n+=value.byteLength;if(n>max){await reader.cancel();throw {status:413}}parts.push(value);
 }}finally{reader.releaseLock()}
 const joined=new Uint8Array(n);let pos=0;
 for(const part of parts){joined.set(part,pos);pos+=part.byteLength}
 try{const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
  if(!input||typeof input!=='object'||Array.isArray(input))throw null;
  return input;}catch{throw {status:400}}
}
async function authorize(req,pair){
 const match=TOKEN.exec(req.headers.get('Authorization')||'');if(!match)throw {status:401};
 const {data,error}=await pair.public.auth.getUser(match[1]);
 if(error||!UUID.test(data?.user?.id||''))throw {status:401};
 const uid=data.user.id;
 const {data:access,error:ae}=await pair.admin.from('lts_account_access')
  .select('user_id,role,enabled,removed_at').eq('user_id',uid).maybeSingle();
 if(ae)throw {status:503};
 if(!access?.enabled||access.removed_at||access.user_id!==uid||
   !['admin','driver'].includes(access.role))throw {status:403};
 await checkLtsSession(pair.admin,match[1],uid);
 if(access.role==='admin'){
  const mfa=await requireAdminMfa(pair.admin,match[1],uid);
  if(!mfa?.enrolled||!mfa?.verified)throw {status:428};
 }
 return {id:uid,role:access.role};
}
// Keep the old eight-key database catalog readable for app-version compatibility.
// The retired REEFER row remains immutable, preserving existing history and
// avoiding accidental failures in older installed clients during rollout.
const EXTRA_KEYS=new Set(['facchinaggioBilico','facchinaggioReefer','reefer','adr',
 'pernotto','sabatoPorto','sabatoTrasferta','preOrario']);
const WRITABLE_EXTRA_KEYS=new Set([...EXTRA_KEYS].filter(key=>key!=='reefer'));
const extraProjection=row=>({serviceKey:row.service_key,cents:row.cents,
 revision:row.revision,updatedAt:row.updated_at});
async function listExtras(db){
 const {data,error}=await db.from('lts_company_extra_rates')
  .select('service_key,cents,revision,updated_at').order('service_key').limit(20);
 if(error||!Array.isArray(data)||data.length!==EXTRA_KEYS.size||
  data.some(row=>!EXTRA_KEYS.has(row.service_key)))throw {status:503};
 return data.map(extraProjection);
}
async function saveExtra(db,input,adminId){
 if(!WRITABLE_EXTRA_KEYS.has(input.serviceKey)||
  !(input.cents===null||(Number.isSafeInteger(input.cents)&&
   input.cents>=0&&input.cents<=99999999))||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)
  throw {status:422,error:'Servizio extra o importo non valido.'};
 const result=await db.from('lts_company_extra_rates')
  .update({cents:input.cents,revision:input.expectedRevision+1,
   updated_at:new Date().toISOString(),updated_by:adminId})
  .eq('service_key',input.serviceKey).eq('revision',input.expectedRevision)
  .select('service_key,cents,revision,updated_at').maybeSingle();
 if(!result.error&&!result.data)throw {status:409,
  error:'Tariffa extra modificata da un altro amministratore. Aggiorna elenco.'};
 if(result.error||!result.data)throw {status:503};
 return extraProjection(result.data);
}
const projection=row=>({id:row.id,client:row.client,city:row.city,
 cents:row.cents,revision:row.revision,updatedAt:row.updated_at});
async function list(db){
 const {data,error}=await db.from('lts_company_tariffs')
  .select('id,client,city,cents,revision,updated_at').order('client').order('city').limit(501);
 if(error||!Array.isArray(data)||data.length>500)throw {status:503};
 return data.map(projection);
}
async function save(db,input,adminId){
 if(input.action!=='save'||!Number.isSafeInteger(input.cents)||
 input.cents<0||input.cents>99999999)throw {status:422,error:'Importo non valido.'};
 const client=normalize(input.client,'Cliente',2),city=normalize(input.city,'Località');
 const existing=input.id!==undefined;
 if(existing&&(!UUID.test(input.id)||!Number.isSafeInteger(input.expectedRevision)||
  input.expectedRevision<1))throw {status:422};
 let result;
 if(existing){
  result=await db.from('lts_company_tariffs')
   .update({cents:input.cents,updated_at:new Date().toISOString(),
    revision:input.expectedRevision+1,updated_by:adminId})
   .eq('id',input.id).eq('client',client).eq('city',city)
   .eq('revision',input.expectedRevision)
   .select('id,client,city,cents,revision,updated_at').maybeSingle();
  if(!result.error&&!result.data)throw {status:409,error:'La tariffa è stata modificata da un altro amministratore. Aggiorna la pagina.'};
 }else{
  result=await db.from('lts_company_tariffs')
   .insert({client,city,cents:input.cents,updated_by:adminId})
   .select('id,client,city,cents,revision,updated_at').single();
 }
 if(result.error?.code==='23505')throw {status:409,error:'Esiste già una tariffa per questo cliente e località.'};
 if(result.error||!result.data)throw {status:503};
 return projection(result.data);
}
export async function handleCompanyTariffs(req,{getClients}={}){
 const origin=req.headers.get('origin');
 if(origin!==ORIGIN)return send({error:'Origine non autorizzata.'},403,origin);
 if(req.method==='OPTIONS'){
  const asked=(req.headers.get('access-control-request-headers')||'').toLowerCase()
   .split(',').map(s=>s.trim()).filter(Boolean);
  if(req.headers.get('access-control-request-method')!=='POST'||asked.some(x=>
   !['authorization','content-type'].includes(x)))return send({error:'Preflight non consentita.'},403,origin);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,
   'Access-Control-Allow-Headers':'Content-Type, Authorization',
   'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'600',Vary:'Origin'}});
 }
 if(req.method!=='POST')return send({error:'Metodo non consentito.'},405,origin);
 if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return send({error:'JSON obbligatorio.'},415,origin);
 try{
  const clients=getClients?.();if(!clients?.public||!clients?.admin)throw {status:503};
  const account=await authorize(req,clients);
  const input=await body(req);
  if(input.action==='list'){
   const [tariffs,extraRates]=await Promise.all([list(clients.admin),listExtras(clients.admin)]);
   return send({tariffs,extraRates},200,origin);
  }
  if(input.action==='extra-save'&&account.role==='admin'){
   const extra=await saveExtra(clients.admin,input,account.id);
   return send({extra},200,origin);
  }
  if(input.action==='save'&&account.role==='admin'){
   const tariff=await save(clients.admin,input,account.id);
   return send({tariff},200,origin);
  }
  throw {status:403};
 }catch(e){
  const code=[400,401,403,405,409,413,415,422,428,503].includes(e?.status)?e.status:503;
  const fallback={400:'Richiesta non valida.',401:'Accedi nuovamente.',403:'Non autorizzato.',
   405:'Metodo non consentito.',409:'Tariffa modificata: aggiorna i dati.',413:'Richiesta troppo grande.',
   415:'Formato non valido.',422:'Cliente, località o importo non valido.',
   428:'Verifica amministratore MFA obbligatoria.',503:'Tariffario temporaneamente non disponibile.'};
  return send({error:e?.error||fallback[code]},code,origin);
 }
}