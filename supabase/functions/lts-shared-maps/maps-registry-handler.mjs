/** LTS private shared customer registry. Only Google Maps links supplied by drivers.
 * No Google Places API, no new scraping. Values are reviewed and submitted by the driver.
 */
import {checkLtsSession} from './lts-session.mjs';
import {requireAdminMfa} from './lts-admin-mfa.mjs';
import {confirmedMapsCustomer,customerIdentityKey} from './confirmed-record.mjs';
import {submitMapsProposal,mapsApprovalList,decideMapsApproval} from './maps-approvals.mjs';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const BEARER=/^Bearer ([A-Za-z0-9._-]{50,4096})$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',Vary:'Origin','X-Content-Type-Options':'nosniff'};
function json(payload,status,origin){
 return new Response(JSON.stringify(payload),{status,
  headers:{...HEADERS,...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})}});
}
async function body(req){
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>8192))throw {status:413};
 const reader=req.body?.getReader();if(!reader)throw {status:400};
 const chunks=[];let n=0;
 try{while(true){
  const {done,value}=await reader.read();if(done)break;
  n+=value.byteLength;if(n>8192){await reader.cancel();throw {status:413};}
  chunks.push(value);
 }}finally{reader.releaseLock();}
 const combined=new Uint8Array(n);let pos=0;
 for(const chunk of chunks){combined.set(chunk,pos);pos+=chunk.byteLength;}
 try{
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(combined));
  if(!input||typeof input!=='object'||Array.isArray(input))throw null;
  return input;
 }catch{throw {status:400};}
}
async function authorize(req,clients){
 const match=BEARER.exec(req.headers.get('authorization')||'');
 if(!match)throw {status:401};
 const {data,error}=await clients.public.auth.getUser(match[1]);
 if(error||!UUID.test(data?.user?.id||''))throw {status:401};
 const id=data.user.id;
 const {data:access,error:ae}=await clients.admin.from('lts_account_access')
  .select('user_id,role,enabled,removed_at').eq('user_id',id).maybeSingle();
 if(ae)throw {status:503};
 if(!access||access.enabled!==true||access.removed_at||
   access.user_id!==id||!['admin','driver'].includes(access.role))throw {status:403};
 await checkLtsSession(clients.admin,match[1],id);
 if(access.role==='admin'){
  const mfa=await requireAdminMfa(clients.admin,match[1],id);
  if(!mfa?.enrolled||!mfa?.verified)throw {status:428};
 }
 return {userId:id,role:access.role};
}
async function consumeQuota(db,userId){
 const {data,error}=await db.rpc('lts_shared_maps_allow_link',{p_user_id:userId});
 if(error||typeof data!=='boolean')throw {status:503};
 if(!data)throw {status:429,error:'Limite giornaliero di link Maps raggiunto.'};
}
// Curated site hints are distinct from personal driver trip notes.
const projection=r=>({name:r.name,city:r.city,address:r.address,
 mapsUrl:r.maps_url,source:'google_maps_link',
 operationalNotes:typeof r.notes==='string'?r.notes:''});
const manualProjection=r=>({name:r.name,city:r.city,address:r.address||'',
 mapsUrl:'',source:'manual',operationalNotes:typeof r.notes==='string'?r.notes:''});
function manualField(value,label,min,max){
 if(typeof value!=='string'||value.length>max||
    /[\u0000-\u001f\u007f]/u.test(value))throw {status:422,error:label+' non valido.'};
 const v=value.normalize('NFC').replace(/\s+/gu,' ').trim().toLocaleUpperCase('it-IT');
 if(v.length<min||v.length>max)throw {status:422,error:label+' non valido.'};
 return v;
}
export async function handleSharedMapsCustomers(req,{getClients}={}){
 const origin=req.headers.get('origin');
 if(origin!==ORIGIN)return json({error:'Origine non autorizzata.'},403,origin);
 if(req.method==='OPTIONS'){
  const headers=(req.headers.get('access-control-request-headers')||'')
   .toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(req.headers.get('access-control-request-method')!=='POST'||
    headers.some(x=>!['authorization','content-type'].includes(x)))
   return json({error:'Richiesta non autorizzata.'},403,origin);
  return new Response(null,{status:204,headers:{
   'Access-Control-Allow-Origin':ORIGIN,
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'Authorization, Content-Type',
   'Access-Control-Max-Age':'600',
   Vary:'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'}});
 }
 if(req.method!=='POST')return json({error:'Metodo non supportato.'},405,origin);
 if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return json({error:'Formato non valido.'},415,origin);
 try{
  const input=await body(req);
  const clients=getClients?.();
  if(!clients?.public||!clients?.admin)throw {status:503};
  const {userId,role}=await authorize(req,clients);
  const db=clients.admin;
  if(input.action==='approval-list'){
   if(role!=='admin')throw {status:403};
   return json({requests:await mapsApprovalList(db)},200,origin);
  }
  if(input.action==='approval-decide'){
   if(role!=='admin')throw {status:403};
   return json(await decideMapsApproval(db,input,userId),200,origin);
  }
  if(input.action==='list'){
   const [maps,manual,fares]=await Promise.all([
    db.from('lts_shared_maps_customers')
     .select('name,city,address,maps_url,notes').order('name').limit(501),
    db.from('lts_shared_customers_manual')
     .select('name,city,address,notes').order('name').limit(501),
    db.from('lts_company_tariffs')
     .select('client,city').order('client').limit(501)
   ]);
   if(maps.error||manual.error||fares.error||!Array.isArray(maps.data)||
      !Array.isArray(manual.data)||!Array.isArray(fares.data)||
      maps.data.length+manual.data.length+fares.data.length>1500)
    throw {status:503};
   const customers=[...maps.data.map(projection),...manual.data.map(manualProjection)];
   // Existing dashboard-created company fares are also shared customer choices.
   // They have no Maps link, and are not copied to the personal driver archive.
   const key=row=>[row.name,row.city].map(value=>String(value||'')
    .normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT')
    .replace(/[^\p{L}\p{N}]+/gu,'')).join('|');
   const keys=new Set(customers.map(key));
   for(const fare of fares.data){
    const fallback=manualProjection({name:fare.client,city:fare.city,address:'',notes:''});
    const id=key(fallback);
    if(keys.has(id))continue;
    customers.push(fallback);keys.add(id);
   }
   if(customers.length>500)throw {status:503};
   customers.sort((a,b)=>a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it'));
   return json({customers},200,origin);
  }
  if(input.action==='save-manual'){
   if(role!=='admin')throw {status:403,error:'Solo l’amministratore può aggiungere clienti condivisi manualmente.'};
   const name=manualField(input.name,'Nome cliente',2,500);
   const city=manualField(input.city,'Località',2,500);
   const address=manualField(input.address??'','Indirizzo',0,1000);
   const notes=manualField(input.notes??'','Note operative',0,1500);
   // Avoid a second shared customer where the same name and municipality are
   // already present in the Maps registry. Do NOT collapse distinct Maps depots.
   const {data:mapsMatches,error:mapErr}=await db.from('lts_shared_maps_customers')
    .select('name,city,address,maps_url,notes').eq('name',name).eq('city',city).limit(1);
   if(mapErr||!Array.isArray(mapsMatches))throw {status:503};
   if(mapsMatches.length)
    return json({customer:projection(mapsMatches[0]),created:false},200,origin);
   const {data:existing,error:existErr}=await db.from('lts_shared_customers_manual')
    .select('name,city,address,notes').eq('name',name).eq('city',city).maybeSingle();
   if(existErr)throw {status:503};
   if(existing)return json({customer:manualProjection(existing),created:false},200,origin);
   const {data:saved,error:saveErr}=await db.from('lts_shared_customers_manual')
    .insert({name,city,address,notes,created_by:userId})
    .select('name,city,address,notes').single();
   if(!saveErr&&saved)return json({customer:manualProjection(saved),created:true},201,origin);
   if(saveErr?.code!=='23505')throw {status:503};
   const {data:again,error:againErr}=await db.from('lts_shared_customers_manual')
    .select('name,city,address,notes').eq('name',name).eq('city',city).maybeSingle();
   if(againErr||!again)throw {status:503};
   return json({customer:manualProjection(again),created:false},200,origin);
  }
  if(input.action==='save-link'){
   // A Maps-origin entry is saved only after the existing driver form confirms
   // the name, city and address. Never fetch Google pages on the shared backend.
   let parsed;
   try{parsed=confirmedMapsCustomer(input);}
   catch(e){throw {status:422,error:e.message};}
   await consumeQuota(db,userId);
   // The database owns the normalized company/site/address key. The UNIQUE
   // indexes on site_key AND maps_url also protect concurrent submissions.
   const {data:siteKey,error:keyError}=await db.rpc('lts_shared_maps_site_fingerprint',
    {p_name:parsed.name,p_city:parsed.city,p_address:parsed.address});
   if(keyError||typeof siteKey!=='string'||!/^[a-f0-9]{64}$/.test(siteKey))
    throw {status:503};
   const {data:existingSite,error:siteError}=await db.from('lts_shared_maps_customers')
    .select('id,name,city,address,maps_url,notes').eq('site_key',siteKey).maybeSingle();
   if(siteError)throw {status:503};
   if(existingSite)return json({customer:projection(existingSite),created:false},200,origin);

   // Identical Maps links identify an existing shared place even if someone
   // changes spelling of the company or address. Never overwrite another site.
   const {data:existingLink,error:linkError}=await db.from('lts_shared_maps_customers')
    .select('id,name,city,address,maps_url,notes').eq('maps_url',parsed.mapsUrl).maybeSingle();
   if(linkError)throw {status:503};
   if(existingLink){
    // Drivers cannot change an existing shared site without administrator review.
    if(role==='driver')return json({customer:projection(existingLink),created:false},200,origin);
    // Upgrade a placeholder-only address when a driver supplies a real street,
    // but preserve curated notes and already-present street information.
    const placeholder=/INDIRIZZO STRADALE DA CONFERMARE|INDIRIZZO DA CONFERMARE/i;
    if(placeholder.test(existingLink.address)&&!placeholder.test(parsed.address)&&
       existingLink.name===parsed.name&&existingLink.city===parsed.city){
     const {data:updated,error:updateError}=await db.from('lts_shared_maps_customers')
      .update({address:parsed.address}).eq('id',existingLink.id)
      .select('name,city,address,maps_url,notes').single();
     if(!updateError&&updated)
      return json({customer:projection(updated),created:false,updated:true},200,origin);
     if(updateError?.code!=='23505')throw {status:503};
     // Another driver may have inserted the same normalized site concurrently.
    }else return json({customer:projection(existingLink),created:false},200,origin);
   }

   if(role==='driver'){
    // The submission is NOT listed among company customers until approved
    // with a fare in one database transaction by an MFA-verified administrator.
    return json(await submitMapsProposal(db,parsed,siteKey,userId),202,origin);
   }
   const identity=await customerIdentityKey(parsed);
   const {data:inserted,error}=await db.from('lts_shared_maps_customers')
    .insert({identity_key:identity,name:parsed.name,city:parsed.city,
     address:parsed.address,maps_url:parsed.mapsUrl,created_by:userId})
    .select('name,city,address,maps_url,notes').single();
   if(!error&&inserted)return json({customer:projection(inserted),created:true},201,origin);
   if(error?.code!=='23505')throw {status:503};
   // A repeated link or an equivalent street is never a new company record.
   const {data:duplicateSite,error:dupeError}=await db.from('lts_shared_maps_customers')
    .select('name,city,address,maps_url,notes').eq('site_key',siteKey).maybeSingle();
   if(dupeError)throw {status:503};
   if(duplicateSite)return json({customer:projection(duplicateSite),created:false},200,origin);
   const {data:duplicateLink,error:linkReadError}=await db.from('lts_shared_maps_customers')
    .select('name,city,address,maps_url,notes').eq('maps_url',parsed.mapsUrl).maybeSingle();
   if(linkReadError||!duplicateLink)throw {status:503};
   return json({customer:projection(duplicateLink),created:false},200,origin);
  }
  throw {status:400,error:'Operazione non riconosciuta.'};
 }catch(error){
  const status=[400,401,403,405,409,413,415,422,428,429,503].includes(error?.status)?error.status:503;
  const fallback={400:'Richiesta non valida.',401:'Accedi al tuo account.',403:'Accesso non autorizzato.',
   413:'Link troppo lungo.',422:'Il link Maps non contiene dati sufficienti.',
   428:'Verifica amministratore MFA necessaria.',409:'La richiesta è già stata elaborata.',429:'Troppe richieste.',
   503:'Registro clienti condiviso momentaneamente non disponibile.'};
  return json({error:error?.error||fallback[status]||'Errore di salvataggio.'},status,origin);
 }
}
