/**
 * Synthetic negative-auth test for LTS payroll Edge handler.
 * No Supabase requests, personal data, or production writes.
 * Actual database RLS/Storage behavior STILL requires isolated QA integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validatePayrollPdf} from '../supabase/functions/lts-payroll/pdf-security.mjs';

const src=readFileSync(new URL('../supabase/functions/lts-payroll/index.ts',import.meta.url),'utf8')
 .replace(/^import .+;\s*$/gm,'')
 // Tests can disable the hard-coded production pilot guard to retain coverage
 // of the full future download flow WITHOUT changing deployed source.
 .replace('const PAYROLL_PILOT_LIST_ONLY=true;','const PAYROLL_PILOT_LIST_ONLY=globalTestPilot;');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const M='00000000-0000-4000-8000-000000000003';
const docA='10000000-0000-4000-8000-000000000001';
const docB='10000000-0000-4000-8000-000000000002';
const draftA='10000000-0000-4000-8000-000000000003';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const endpoint='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-payroll';
const tokens={a:'a'.repeat(70),b:'b'.repeat(70),admin:'m'.repeat(70),
 revoked:'r'.repeat(70),revokedAdmin:'v'.repeat(70),errorAdmin:'e'.repeat(70)};
function syntheticPdf(extra=''){
 const head='%PDF-1.5\n',obj='1 0 obj\n<< /Type /Catalog '+extra+' >>\nendobj\n';
 const offset=Buffer.byteLength(head+obj,'latin1');
 return head+obj+'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n'+
  'trailer\n<< /Root 1 0 R /Size 2 >>\nstartxref\n'+offset+'\n%%EOF\n';
}

function fixture({adminMfa=true,enabled=true,preview=false,allowedUsers=[A,B,M],expiry='2099-01-01T00:00:00Z'}={}){
 const accounts=[
  {user_id:A,role:'driver',enabled:true,removed_at:null},
  {user_id:B,role:'driver',enabled:true,removed_at:null},
  {user_id:M,role:'admin',enabled:true,removed_at:null}
 ];
 const allowlist=allowedUsers.map(user_id=>({user_id,role:user_id===M?'admin':'driver',
  slot:user_id===A?'driver_a':user_id===B?'driver_b':'admin',enabled:true,expires_at:expiry}));
 const names=[
  {auth_user_id:A,first_name:'Milano',last_name:'Pasquale'},
  {auth_user_id:B,first_name:'Mario',last_name:'Rossi'}
 ];
 const docs=[
  {id:docA,driver_id:A,category:'cedolino',state:'published',object_path:A+'/2026/'+docA+'.pdf',first_accessed_at:null,acknowledged_at:null},
  {id:docB,driver_id:B,category:'cedolino',state:'published',object_path:B+'/2026/'+docB+'.pdf',first_accessed_at:null,acknowledged_at:null},
  {id:draftA,driver_id:A,category:'cedolino',state:'draft',object_path:A+'/2026/'+draftA+'.pdf',first_accessed_at:null,acknowledged_at:null}
 ];
 const audit=[],reads=[],writes=[];
 class Query{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}
  limit(){return this;}
  in(key,values){this.filters.push(row=>values.includes(row[key]));return this;}
  update(patch){this.patch=patch;return this;}
  eq(key,val){this.filters.push(row=>row[key]===val);return this;}
  neq(key,val){this.filters.push(row=>row[key]!==val);return this;}
  gt(key,val){this.filters.push(row=>row[key]>val);return this;}
  is(key,val){this.filters.push(row=>row[key]===val);return this;}
  order(){return this;}
  range(){return this;}
  values(){
   const rows=this.table==='lts_account_access'?accounts:this.table==='lts_payroll_documents'?docs:
    this.table==='lts_payroll_test_allowlist'?allowlist:this.table==='lts_pending_drivers'?names:[];
   return rows.filter(row=>this.filters.every(test=>test(row)));
  }
  maybeSingle(){
   const row=this.values()[0]||null;
   if(row&&this.patch)Object.assign(row,this.patch);
   return Promise.resolve({data:row,error:null});
  }
  then(resolve,reject){return Promise.resolve({data:this.values(),error:null}).then(resolve,reject);}
  insert(entry){
   if(this.table==='lts_payroll_documents'){
    docs.push(entry);
    return {select(){return {single:async()=>({data:{id:entry.id},error:null})}}};
   }
   audit.push(entry);return Promise.resolve({data:null,error:null});
  }
 }
 const db={
  from:table=>new Query(table),
  storage:{from:()=>({
   upload:async path=>{writes.push(path);return {error:null};},
   remove:async()=>({error:null}),
   download:async path=>{
    reads.push(path);
    return docs.some(d=>d.object_path===path)?
     {data:new Blob(['%PDF-1.5\n1 0 obj\nendobj\n%%EOF'],{type:'application/pdf'}),error:null}:
     {data:null,error:{message:'not found'}};
   }
  })},
  rpc:async (name,args)=>{
   if(name==='lts_payroll_revoke'){
    const doc=docs.find(d=>d.id===args.p_document_id&&d.state==='published');
    if(args.p_actor_id!==M||!doc)return {data:null,error:null};
    doc.state='archived';audit.push({document_id:doc.id,actor_id:M,event:'archive'});
    return {data:'2026-11-22T14:00:00Z',error:null};
   }
   const doc=docs.find(d=>d.id===args.p_document_id&&d.driver_id===args.p_driver_id);
   if(!doc||doc.state!=='published')return {data:null,error:null};
   if(name==='lts_payroll_mark_first_access'){
    if(doc.category==='cedolino'&&!doc.acknowledged_at)return {data:null,error:null};
    if(!doc.first_accessed_at){doc.first_accessed_at='2026-11-18T10:00:00Z';audit.push({event:'first_access'});}
    return {data:doc.first_accessed_at,error:null};
   }
   if(name==='lts_payroll_acknowledge'){
    if(doc.category!=='cedolino')return {data:null,error:null};
    if(!doc.acknowledged_at){doc.acknowledged_at='2026-11-18T10:03:00Z';audit.push({event:'acknowledge'});}
    return {data:doc.acknowledged_at,error:null};
   }
   throw Error('unexpected rpc');
  }
 };
 const publicClient={
  auth:{getUser:async token=>{
   const id=token===tokens.a||token===tokens.revoked?A:token===tokens.b?B:
    [tokens.admin,tokens.revokedAdmin,tokens.errorAdmin].includes(token)?M:null;
   return {data:{user:id?{id}:null},error:id?null:'bad token'};
  }}
 };
 let handler=null;
 const deno={
  env:{get:key=>({
   LTS_PAYROLL_ENABLED:enabled?'yes':null,
   SUPABASE_URL:'https://unit-test.supabase.co',
   SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'public-key-at-least-11-characters'}),
   SUPABASE_SECRET_KEYS:JSON.stringify({default:'secret-key-at-least-11-characters'})
  })[key]||null},
  serve(fn){handler=fn;}
 };
 runInNewContext(src,{
  createClient:(_url,key)=>key.startsWith('public-key')?publicClient:db,
  checkLtsSession:async (_db,token)=>{
   if(token===tokens.revoked||token===tokens.revokedAdmin)throw {status:403};
   if(token===tokens.errorAdmin)throw {status:503,message:'PRIVATE_DATABASE_CONNECTION_STRING_DO_NOT_LEAK'};
  },
  requireAdminMfa:async()=>({enrolled:adminMfa,verified:adminMfa}),
  validatePayrollPdf,
  Deno:deno,globalTestPilot:preview,URL,Request,Response,Blob,File,TextDecoder,TextEncoder,crypto,atob,
  console
 },{timeout:2000});
 assert.equal(typeof handler,'function');
 async function call(token,action,options={}){
  const request=new Request(endpoint,{method:'POST',headers:{
   'Origin':ORIGIN,'Authorization':'Bearer '+token,'Content-Type':'application/json'
  },body:JSON.stringify({action,...options})});
  const response=await handler(request);
  return {status:response.status,data:response.headers.get('content-type')?.includes('json')?
    await response.json():await response.arrayBuffer()};
 }
 async function callUpload(token,driverId,pdf=syntheticPdf()){
  const fields=new FormData();
  fields.set('file',new File([pdf],'test.pdf',{type:'application/pdf'}));
  fields.set('driverId',driverId);
  fields.set('category','cedolino');
  fields.set('year','2026');
  fields.set('month','11');
  fields.set('label','Documento prova');
  const request=new Request(endpoint,{method:'POST',headers:{
   Origin:ORIGIN,Authorization:'Bearer '+token
  },body:fields});
  const response=await handler(request);
  return {status:response.status,data:await response.json()};
 }
 async function callRaw({method='POST',origin=ORIGIN,headers={},body}={}){
  // Direct VM handler call: never a network request or a real credential.
  const h={...(origin===null?{}:{Origin:origin}),...headers};
  const request=new Request(endpoint,{method,headers:h,
   ...(body===undefined?{}:{body})});
  const response=await handler(request);
  return {status:response.status,headers:response.headers,
   data:response.headers.get('content-type')?.includes('json')?
    await response.json():null};
 }
 return {call,callRaw,callUpload,docs,audit,reads,writes,allowlist,names};
}

test('driver pilot list is owner-scoped; authenticated MFA admin may manage documents',async()=>{
 const x=fixture({enabled:false,preview:true,allowedUsers:[A]});
 const listing=await x.call(tokens.a,'list');
 assert.equal(listing.status,200);
 assert.equal(listing.data.documents.length,1);
 assert.equal(listing.data.documents[0].id,docA);
 assert.equal((await x.call(tokens.b,'list')).status,403);
 const adminRoster=await x.call(tokens.admin,'drivers');
 assert.equal(adminRoster.status,200,'admin role plus MFA needs no tester seat');
 assert.equal(adminRoster.data.drivers.length,2);
 assert.equal(adminRoster.data.drivers.filter(d=>d.documents_enabled).length,1);
 assert.equal(adminRoster.data.drivers.find(d=>d.id===A).documents_enabled,true);
 assert.equal(adminRoster.data.drivers.find(d=>d.id===B).documents_enabled,false);
 const adminDocs=await x.call(tokens.admin,'list');
 assert.equal(adminDocs.status,200);
 assert.equal(adminDocs.data.documents.length,3,'admin sees drafts and published metadata');
 for(const action of ['download','acknowledge','publish','revoke','drivers']){
  const result=await x.call(tokens.a,action,{id:docA});
  assert.equal(result.status,503,'driver pilot does not allow '+action);
 }
 assert.equal(x.reads.length,0);
 assert.equal(x.audit.length,0);
});

test('expired or missing tester cannot list; verified admin still enters',async()=>{
 const missing=fixture({enabled:false,preview:true,allowedUsers:[]});
 assert.equal((await missing.call(tokens.a,'list')).status,403);
 assert.equal((await missing.call(tokens.admin,'drivers')).status,200);
 const expired=fixture({enabled:false,preview:true,allowedUsers:[A],expiry:'2020-01-01T00:00:00Z'});
 assert.equal((await expired.call(tokens.a,'list')).status,403);
 assert.equal((await expired.call(tokens.admin,'drivers')).status,200);
});

test('driver pilot is list-only even if legacy global payroll flag was enabled',async()=>{
 const x=fixture({enabled:true,preview:true,allowedUsers:[A]});
 assert.equal((await x.call(tokens.a,'list')).status,200);
 for(const action of ['download','acknowledge','publish','revoke','drivers'])
  assert.equal((await x.call(tokens.a,action,{id:docA})).status,503,action);
 assert.equal(x.audit.length,0);assert.equal(x.reads.length,0);
});

test('non-allowlisted drivers remain denied; admin without test seat may read PDF',async()=>{
 const x=fixture({enabled:false,preview:true,allowedUsers:[]});
 for(const [token,action] of [
  [tokens.a,'list'],[tokens.a,'download'],[tokens.a,'acknowledge'],
  [tokens.b,'download']
 ])assert.equal((await x.call(token,action,{id:docA})).status,403);
 const adminPdf=await x.call(tokens.admin,'download',{id:docA});
 assert.equal(adminPdf.status,200,'admin can download published PDF with MFA');
 assert.equal(x.reads.length,1);
 assert.equal(x.docs[0].first_accessed_at,null,'admin reading is not driver first access');
});

test('admin cannot publish a draft to a driver not enabled for the pilot',async()=>{
 const x=fixture({enabled:false,preview:true,allowedUsers:[B]});
 const denied=await x.call(tokens.admin,'publish',{id:draftA});
 assert.equal(denied.status,403);
 assert.equal(x.docs.find(d=>d.id===draftA).state,'draft');
 assert.equal(x.audit.length,0);
});
test('only MILANO PASQUALE may receive uploaded PDF bytes',async()=>{
 const x=fixture({allowedUsers:[A,B]});
 const other=await x.callUpload(tokens.admin,B);
 assert.equal(other.status,403);
 assert.equal(x.writes.length,0,'other driver rejected before private Storage write');
 assert.equal(x.docs.length,3,'other driver leaves no metadata');
 const driverAttempt=await x.callUpload(tokens.a,A);
 assert.equal(driverAttempt.status,403,'driver cannot upload even to self');
 assert.equal(x.writes.length,0);
 const admin=await x.callUpload(tokens.admin,A);
 assert.equal(admin.status,201);
 assert.equal(admin.data.state,'draft');
 assert.equal(x.docs.length,4);
 assert.equal(x.docs.at(-1).driver_id,A);
 assert.equal(x.writes.length,1);
 assert.equal(x.writes[0].startsWith(A+'/2026/'),true);
});
test('malformed or active PDF is denied before private Storage upload',async()=>{
 const x=fixture({allowedUsers:[A]});
 for(const pdf of [syntheticPdf('/OpenAction'),syntheticPdf().replace('%%EOF',''),syntheticPdf('/J#61vaScript')]){
  const r=await x.callUpload(tokens.admin,A,pdf);
  assert.equal(r.status,400);
  assert.equal(x.writes.length,0,'invalid PDF must never reach Storage');
 }
});

test('a reassigned driver_a slot is rejected if its identity is not MILANO PASQUALE',async()=>{
 const x=fixture({allowedUsers:[B]});
 x.allowlist[0].slot='driver_a';
 assert.equal((await x.callUpload(tokens.admin,B)).status,403);
 assert.equal(x.writes.length,0);
 assert.equal((await x.call(tokens.admin,'drivers')).data.drivers.some(d=>d.documents_enabled),false);
});
test('a second allowlisted driver cannot become an upload or publication recipient',async()=>{
 const x=fixture({enabled:false,preview:true,allowedUsers:[A,B]});
 const r=await x.call(tokens.admin,'drivers');
 assert.equal(r.status,200);
 assert.equal(r.data.drivers.filter(d=>d.documents_enabled).length,1);
 assert.equal(r.data.drivers.find(d=>d.id===B).documents_enabled,false);
 x.docs.push({...x.docs[2],id:'10000000-0000-4000-8000-000000000004',driver_id:B});
 const rejected=await x.call(tokens.admin,'publish',{id:'10000000-0000-4000-8000-000000000004'});
 assert.equal(rejected.status,403);
 assert.equal(x.docs.at(-1).state,'draft');
});
test('admin may publish a draft to allowlisted driver only',async()=>{
 const x=fixture({enabled:false,preview:true,allowedUsers:[A]});
 const published=await x.call(tokens.admin,'publish',{id:draftA});
 assert.equal(published.status,200);
 assert.equal(x.docs.find(d=>d.id===draftA).state,'published');
 assert.equal((await x.call(tokens.admin,'publish',{id:draftA})).status,409);
});
test('autista B cannot read PDF or acknowledge receipt for autista A',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.b,'download',{id:docA})).status,403);
 assert.equal((await x.call(tokens.b,'acknowledge',{id:docA})).status,409);
 assert.equal(x.docs[0].first_accessed_at,null);
 assert.equal(x.docs[0].acknowledged_at,null);
});

test('autista A cannot read B nor receive unpublished drafts',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.a,'download',{id:docB})).status,403);
 assert.equal((await x.call(tokens.a,'download',{id:draftA})).status,403);
 assert.equal((await x.call(tokens.a,'publish',{id:docA})).status,403);
 assert.equal((await x.call(tokens.a,'drivers')).status,403);
});

test('cedolino PDF is denied until owner confirms availability, then accessible',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,409);
 assert.equal(x.reads.length,0,'storage not read before confirmation');
 assert.equal(x.docs[0].first_accessed_at,null);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal(x.docs[0].first_accessed_at,null,'confirm is not first PDF access');
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal(x.audit.filter(e=>e.event==='acknowledge').length,1,'idempotent receipt');
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.ok(x.docs[0].first_accessed_at,'first access after confirmation');
 assert.equal(x.audit.filter(e=>e.event==='first_access').length,1);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal(x.audit.filter(e=>e.event==='first_access').length,1);
});

test('one receipt survives repeated lists and PDF opens; admin sees original timestamp',async()=>{
 const x=fixture();
 const before=await x.call(tokens.a,'list');
 assert.equal(before.status,200);
 assert.equal(before.data.documents.find(d=>d.id===docA)?.acknowledged_at,null);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 const confirmedAt=x.docs.find(d=>d.id===docA)?.acknowledged_at;
 assert.ok(confirmedAt,'persistent receipt timestamp required');
 // Each list simulates a fresh page load retrieving the server-recorded value.
 const afterReload=await x.call(tokens.a,'list');
 assert.equal(afterReload.status,200);
 assert.equal(afterReload.data.documents.find(d=>d.id===docA)?.acknowledged_at,confirmedAt);
 const adminList=await x.call(tokens.admin,'list',{driverId:A});
 assert.equal(adminList.status,200);
 assert.equal(adminList.data.documents.find(d=>d.id===docA)?.acknowledged_at,confirmedAt);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal(x.docs.find(d=>d.id===docA)?.acknowledged_at,confirmedAt,'retry never changes receipt');
 assert.equal(x.audit.filter(e=>e.event==='acknowledge').length,1,'only one confirmation audit');
 assert.equal(x.audit.filter(e=>e.event==='first_access').length,1,'only one first-access audit');
 assert.equal((await x.call(tokens.b,'list')).data.documents.some(d=>d.id===docA),false,'no cross-driver receipt leakage');
});

test('forged client receipt fields never bypass server PDF gate',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.b,'acknowledge',{id:docA,driverId:A,confirmed:true})).status,409);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:draftA,confirmed:true})).status,409);
 assert.equal((await x.call(tokens.a,'download',{id:docA,acknowledged_at:'2099-01-01',confirmed:true})).status,409);
 assert.equal(x.reads.length,0,'denied before reaching storage');
});
test('revoked JWT and admin without enrolled MFA are denied all document actions',async()=>{
 const x=fixture({adminMfa:false});
 assert.equal((await x.call(tokens.revoked,'download',{id:docA})).status,403);
 assert.equal((await x.call(tokens.admin,'drivers')).status,428);
 assert.equal((await x.call(tokens.admin,'download',{id:docA})).status,428);
});


test('verified LTS session grants only the driver-owned published documents without biometrics',async()=>{
 const x=fixture();
 const own=await x.call(tokens.a,'list');
 assert.equal(own.status,200);
 assert.equal(own.data.documents.length,1,'drafts and other drivers must remain hidden');
 assert.equal(own.data.documents[0].id,docA);
 assert.equal((await x.call(tokens.b,'download',{id:docA})).status,403);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,409);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal((await x.call(tokens.revoked,'list')).status,403);
});

test('a supplied unlock token cannot bypass driver ownership or revocation',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.b,'download',{id:docA,unlockToken:'forged'})).status,403);
 assert.equal((await x.call(tokens.revoked,'download',{id:docA,unlockToken:'forged'})).status,403);
 assert.equal((await x.call(tokens.a,'download',{id:draftA,unlockToken:'forged'})).status,403);
});

// Tests run the real Edge handler; only Auth, MFA and storage are synthetic.
test('MFA admin revokes once; drivers cannot revoke or read/ack a revoked PDF',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.a,'revoke',{id:docA})).status,403);
 assert.equal((await x.call(tokens.admin,'revoke',{id:docA})).status,200);
 assert.equal((await x.call(tokens.admin,'revoke',{id:docA})).status,409);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,403);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,409);
 assert.equal((await x.call(tokens.admin,'download',{id:docA})).status,403);
 assert.equal(x.audit.filter(e=>e.event==='archive').length,1);
 assert.equal(x.docs.length,3,'revocation never deletes documents');
});
test('admin without MFA cannot revoke',async()=>{
 const x=fixture({adminMfa:false});
 assert.equal((await x.call(tokens.admin,'revoke',{id:docA})).status,428);
 assert.equal(x.docs[0].state,'published');
});


test('unauthenticated and revoked admin tokens cannot access document roster',async()=>{
 const x=fixture({allowedUsers:[A]});
 assert.equal((await x.call('','drivers')).status,401,'missing token');
 assert.equal((await x.call('z'.repeat(70),'drivers')).status,401,'invalid token');
 assert.equal((await x.call(tokens.revokedAdmin,'drivers')).status,403,'revoked admin session');
 assert.equal((await x.call(tokens.revokedAdmin,'list')).status,403,'revoked session cannot read metadata');
 assert.equal((await x.callUpload(tokens.revokedAdmin,A)).status,403,'revoked session cannot upload');
 assert.equal(x.reads.length,0);
 assert.equal(x.writes.length,0);
});

test('admin MFA is required for PDF upload, not only dashboard navigation',async()=>{
 const x=fixture({adminMfa:false,allowedUsers:[A]});
 assert.equal((await x.callUpload(tokens.admin,A)).status,428);
 assert.equal(x.writes.length,0,'no write before MFA check');
 assert.equal(x.docs.length,3,'no metadata before MFA check');
});

test('internal 503 errors never expose database details in the API response',async()=>{
 const x=fixture({allowedUsers:[A]});
 const r=await x.call(tokens.errorAdmin,'drivers');
 assert.equal(r.status,503);
 assert.equal(r.data.error,'Servizio documenti temporaneamente non disponibile.');
 assert.equal(JSON.stringify(r.data).includes('PRIVATE_DATABASE_CONNECTION_STRING'),false);
 assert.equal(x.reads.length,0);
 assert.equal(x.writes.length,0);
});


test('credential-free raw HTTP cannot read, acknowledge, revoke or upload any PDF',async()=>{
 const x=fixture({allowedUsers:[A]});
 const actions=['list','drivers','publish','revoke','download','acknowledge'];
 for(const action of actions){
  const payload=JSON.stringify({action,id:docA,driverId:A,confirmed:true});
  const noToken=await x.callRaw({headers:{'Content-Type':'application/json'},body:payload});
  assert.equal(noToken.status,401,'missing Authorization: '+action);
  const fakeToken=await x.callRaw({headers:{
   Authorization:'Bearer '+('q'.repeat(70)),'Content-Type':'application/json'
  },body:payload});
  assert.equal(fakeToken.status,401,'unknown bearer token: '+action);
 }
 const fields=new FormData();
 fields.set('file',new File([syntheticPdf()],'qa-synthetic.pdf',{type:'application/pdf'}));
 fields.set('driverId',A);
 fields.set('category','cedolino');
 fields.set('year','2026');
 fields.set('month','11');
 fields.set('label','QA synthetic, never real');
 const upload=await x.callRaw({body:fields});
 assert.equal(upload.status,401,'anonymous multipart cannot bypass JWT');
 assert.equal(x.writes.length,0,'no Storage write without JWT');
 assert.equal(x.reads.length,0,'no Storage read without JWT');
 assert.equal(x.audit.length,0,'no audit events from denied calls');
 assert.equal(x.docs.length,3,'no document metadata created or altered');
});

test('credential-free CORS checks reject hostile origins and bypass preflights',async()=>{
 const x=fixture({allowedUsers:[A]});
 const payload=JSON.stringify({action:'drivers'});
 for(const origin of ['https://evil.invalid','null',null]){
  const denied=await x.callRaw({origin,headers:{
   Authorization:'Bearer '+tokens.admin,'Content-Type':'application/json'
  },body:payload});
  assert.equal(denied.status,403,'forbidden origin '+origin);
  assert.notEqual(denied.headers.get('access-control-allow-origin'),origin);
 }
 const preflight=await x.callRaw({method:'OPTIONS',headers:{
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'authorization,content-type'
 }});
 assert.equal(preflight.status,204,'legitimate preflight needs no login');
 assert.equal(preflight.headers.get('access-control-allow-origin'),ORIGIN);
 assert.equal(preflight.headers.get('access-control-allow-methods'),'POST, OPTIONS');
 assert.match(preflight.headers.get('cache-control'),/no-store/);
 const forbiddenHeader=await x.callRaw({method:'OPTIONS',headers:{
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'authorization,x-admin-bypass'
 }});
 assert.equal(forbiddenHeader.status,403);
 const forbiddenMethod=await x.callRaw({method:'OPTIONS',headers:{
  'Access-Control-Request-Method':'DELETE',
  'Access-Control-Request-Headers':'authorization'
 }});
 assert.equal(forbiddenMethod.status,403);
 const getRequest=await x.callRaw({method:'GET'});
 assert.equal(getRequest.status,405,'GET never dispatches payroll actions');
 assert.equal(x.writes.length,0);
 assert.equal(x.reads.length,0);
 assert.equal(x.docs.length,3);
 assert.equal(x.audit.length,0);
});
