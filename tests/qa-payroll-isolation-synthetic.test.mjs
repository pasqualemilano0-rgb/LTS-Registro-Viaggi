/**
 * Synthetic negative-auth test for LTS payroll Edge handler.
 * No Supabase requests, personal data, or production writes.
 * Actual database RLS/Storage behavior STILL requires isolated QA integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../supabase/functions/lts-payroll/index.ts',import.meta.url),'utf8')
 .replace(/^import .+;\s*$/gm,'');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const M='00000000-0000-4000-8000-000000000003';
const docA='10000000-0000-4000-8000-000000000001';
const docB='10000000-0000-4000-8000-000000000002';
const draftA='10000000-0000-4000-8000-000000000003';
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const endpoint='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-payroll';
const tokens={a:'a'.repeat(70),b:'b'.repeat(70),admin:'m'.repeat(70),revoked:'r'.repeat(70)};

function fixture({adminMfa=true,disabledDriver=false,removedDriver=false}={}){
 const accounts=[
  {user_id:A,role:'driver',enabled:!disabledDriver,removed_at:removedDriver?'2026-11-22T12:00:00Z':null},
  {user_id:B,role:'driver',enabled:true,removed_at:null},
  {user_id:M,role:'admin',enabled:true,removed_at:null}
 ];
 const docs=[
  {id:docA,driver_id:A,category:'cedolino',state:'published',object_path:A+'/2026/'+docA+'.pdf',first_accessed_at:null,acknowledged_at:null},
  {id:docB,driver_id:B,category:'cedolino',state:'published',object_path:B+'/2026/'+docB+'.pdf',first_accessed_at:null,acknowledged_at:null},
  {id:draftA,driver_id:A,category:'cedolino',state:'draft',object_path:A+'/2026/'+draftA+'.pdf',first_accessed_at:null,acknowledged_at:null}
 ];
 const audit=[];
 class Query{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}
  eq(key,val){this.filters.push(row=>row[key]===val);return this;}
  is(key,val){this.filters.push(row=>row[key]===val);return this;}
  order(){return this;}
  range(){return this;}
  values(){
   const rows=this.table==='lts_account_access'?accounts:this.table==='lts_payroll_documents'?docs:[];
   return rows.filter(row=>this.filters.every(test=>test(row)));
  }
  maybeSingle(){return Promise.resolve({data:this.values()[0]||null,error:null});}
  then(resolve,reject){return Promise.resolve({data:this.values(),error:null}).then(resolve,reject);}
  insert(entry){audit.push(entry);return Promise.resolve({data:null,error:null});}
 }
 const db={
  from:table=>new Query(table),
  storage:{from:()=>({
   download:async path=>docs.some(d=>d.object_path===path)?
    {data:new Blob(['%PDF-1.5\n1 0 obj\nendobj\n%%EOF'],{type:'application/pdf'}),error:null}:
    {data:null,error:{message:'not found'}}
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
    if(!doc.first_accessed_at){doc.first_accessed_at='2026-11-18T10:00:00Z';audit.push({event:'first_access'});}
    return {data:doc.first_accessed_at,error:null};
   }
   if(name==='lts_payroll_acknowledge'){
    if(doc.category!=='cedolino'||!doc.first_accessed_at)return {data:null,error:null};
    if(!doc.acknowledged_at){doc.acknowledged_at='2026-11-18T10:03:00Z';audit.push({event:'acknowledge'});}
    return {data:doc.acknowledged_at,error:null};
   }
   throw Error('unexpected rpc');
  }
 };
 const publicClient={
  auth:{getUser:async token=>{
   const id=token===tokens.a||token===tokens.revoked?A:token===tokens.b?B:token===tokens.admin?M:null;
   return {data:{user:id?{id}:null},error:id?null:'bad token'};
  }}
 };
 let handler=null;
 const deno={
  env:{get:key=>({
   SUPABASE_URL:'https://unit-test.supabase.co',
   SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'public-key-at-least-11-characters'}),
   SUPABASE_SECRET_KEYS:JSON.stringify({default:'secret-key-at-least-11-characters'})
  })[key]||null},
  serve(fn){handler=fn;}
 };
 runInNewContext(src,{
  createClient:(_url,key)=>key.startsWith('public-key')?publicClient:db,
  checkLtsSession:async (_db,token)=>{if(token===tokens.revoked)throw {status:403};},
  requireAdminMfa:async()=>({enrolled:adminMfa,verified:adminMfa}),
  Deno:deno,URL,Request,Response,Blob,File,TextDecoder,TextEncoder,crypto,atob,
  console
 },{timeout:2000});
 assert.equal(typeof handler,'function');
 async function call(token,action,options={},origin=ORIGIN){
  const request=new Request(endpoint,{method:'POST',headers:{
   'Origin':origin,'Authorization':'Bearer '+token,'Content-Type':'application/json'
  },body:JSON.stringify({action,...options})});
  const response=await handler(request);
  return {status:response.status,data:response.headers.get('content-type')?.includes('json')?
    await response.json():await response.arrayBuffer()};
 }
 return {call,docs,audit};
}

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

test('acknowledgement is optional, needs a successful PDF request and is idempotent',async()=>{
 const x=fixture();
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,409);
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
 assert.equal(x.audit.filter(e=>e.event==='first_access').length,1);
 assert.equal(x.audit.filter(e=>e.event==='acknowledge').length,1);
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
 assert.equal((await x.call(tokens.a,'download',{id:docA})).status,200);
 assert.equal((await x.call(tokens.a,'acknowledge',{id:docA})).status,200);
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


test('Step 1: inactive or removed driver is denied listing, PDF and receipt',async()=>{
 for(const state of [{disabledDriver:true},{removedDriver:true}]){
  const x=fixture(state);
  for(const action of ['list','download','acknowledge']){
   const options=action==='list'?{}:{id:docA};
   assert.equal((await x.call(tokens.a,action,options)).status,403,action);
  }
  assert.equal(x.docs[0].first_accessed_at,null);
  assert.equal(x.docs[0].acknowledged_at,null);
 }
});

test('Step 1: forged or malformed JWT, wrong origin and retired passkey actions fail closed',async()=>{
 const x=fixture();
 assert.equal((await x.call('z'.repeat(70),'list')).status,401);
 assert.equal((await x.call('invalid','list')).status,401);
 assert.equal((await x.call(tokens.a,'list',{},'https://evil.invalid')).status,403);
 assert.equal((await x.call(tokens.a,'passkey-status')).status,400);
});

test('Step 1: caller-controlled driverId never overrides verified session identity',async()=>{
 const x=fixture();
 const a=await x.call(tokens.a,'list',{driverId:B});
 const b=await x.call(tokens.b,'list',{driverId:A});
 assert.equal(a.status,200);
 assert.equal(b.status,200);
 assert.deepEqual(Array.from(a.data.documents,doc=>doc.id),[docA]);
 assert.deepEqual(Array.from(b.data.documents,doc=>doc.id),[docB]);
 assert.equal((await x.call(tokens.a,'publish',{id:docA,driverId:B})).status,403);
});

test('Step 1: driver session revocation prevents all document operations',async()=>{
 const x=fixture();
 for(const action of ['list','download','acknowledge','drivers','publish','revoke']){
  const options=action==='list'||action==='drivers'?{}:{id:docA};
  assert.equal((await x.call(tokens.revoked,action,options)).status,403,action);
 }
});
