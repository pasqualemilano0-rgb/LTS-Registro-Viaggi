import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ORIGIN='https://pasqualemilano0-rgb.github.io';
const uid='11111111-1111-4111-8111-111111111111';
const token='A'.repeat(96);
const source=read('supabase/functions/lts-shared-maps/maps-registry-handler.mjs')
 .replace(/^import .*\n/gm,'')
 .replace('export async function handleSharedMapsCustomers','async function handleSharedMapsCustomers');

function harness({role='admin',mfa=true,rpcResult=null,rpcError=null}={}){
 const calls=[];
 const db={
  from(table){
   calls.push({type:'from',table});
   assert.equal(table,'lts_account_access',
    'The atomic action must not issue two direct table writes');
   return {
    select(){return this},
    eq(){return this},
    async maybeSingle(){return {data:{user_id:uid,role,enabled:true,removed_at:null},error:null}}
   };
  },
  async rpc(name,args){
   calls.push({type:'rpc',name,args});
   return {data:rpcResult||{
    created:true,rateChanged:true,
    customer:{name:args.p_name,city:args.p_city,address:args.p_address,
     mapsUrl:args.p_source==='maps'?args.p_maps_url:'',source:args.p_source==='maps'?
     'google_maps_link':'manual',operationalNotes:args.p_notes},
    tariff:{id:'new',client:args.p_name,city:args.p_city,cents:args.p_cents,
     revision:1,updatedAt:'2026-11-10T07:00:00Z'}
   },error:rpcError};
  }
 };
 const getClients=()=>({
  public:{auth:{async getUser(){return {data:{user:{id:uid}},error:null}}}},
  admin:db
 });
 const fn=runInNewContext(source+'\nhandleSharedMapsCustomers',{
  Request,Response,TextEncoder,TextDecoder,Uint8Array,
  checkLtsSession:async()=>{},
  requireAdminMfa:async()=>mfa?{enrolled:true,verified:true}:(()=>{
   throw {status:428};})(),
  confirmedMapsCustomer:input=>{
   if(typeof input.url!=='string'||!input.url.startsWith('https://maps.app.goo.gl/'))
    throw Error('Link Google Maps non valido.');
   return {name:input.name.toUpperCase(),city:input.city.toUpperCase(),
    address:input.address.toUpperCase(),mapsUrl:input.url};
  },
  customerIdentityKey:async()=>'',submitMapsProposal:async()=>({}),
  mapsApprovalList:async()=>[],decideMapsApproval:async()=>({}),
 });
 const post=async data=>{
  const req=new Request('https://example.org/',{
   method:'POST',headers:{origin:ORIGIN,authorization:'Bearer '+token,
    'content-type':'application/json'},body:JSON.stringify(data)});
  const res=await fn(req,{getClients});
  return {status:res.status,data:await res.json()};
 };
 return {post,calls};
}
const manual={action:'save-priced',source:'manual',name:'CLIENTE TEST',
 city:'NAPOLI',address:'VIA PORTO 1',notes:'',cents:8550,expectedRevision:0};
test('MFA-verified administrator publishes customer + fare in exactly one RPC',async()=>{
 const h=harness();
 const res=await h.post(manual);
 assert.equal(res.status,201);
 assert.equal(res.data.customer.name,'CLIENTE TEST');
 assert.equal(res.data.tariff.cents,8550);
 const rpc=h.calls.filter(c=>c.type==='rpc');
 assert.equal(rpc.length,1);
 assert.equal(rpc[0].name,'lts_company_register_priced_customer');
 assert.equal(rpc[0].args.p_cents,8550);
 assert.equal(rpc[0].args.p_expected_revision,0);
 assert.equal(rpc[0].args.p_source,'manual');
});
test('administrative Maps onboarding also uses the same single SQL transaction',async()=>{
 const h=harness();
 const res=await h.post({...manual,source:'maps',
  url:'https://maps.app.goo.gl/someKnownPlace',address:'VIA PORTO 8'});
 assert.equal(res.status,201);
 const rpc=h.calls.filter(x=>x.type==='rpc');
 assert.equal(rpc.length,1);
 assert.equal(rpc[0].args.p_source,'maps');
 assert.equal(rpc[0].args.p_maps_url,'https://maps.app.goo.gl/someKnownPlace');
});
test('drivers and administrators without MFA cannot invoke the atomic mutation',async()=>{
 for(const opts of [{role:'driver'},{mfa:false}]){
  const h=harness(opts);
  const res=await h.post(manual);
  assert.equal(res.status,opts.role==='driver'?403:428);
  assert.equal(h.calls.some(x=>x.type==='rpc'),false);
 }
});
test('revision conflict fails closed with an explanatory error',async()=>{
 const h=harness({rpcError:{code:'P0001',
  message:'Tariffa cambiata: aggiorna e conferma il nuovo importo.'}});
 const res=await h.post({...manual,expectedRevision:3});
 assert.equal(res.status,409);
 assert.match(res.data.error,/Tariffa cambiata/);
 assert.equal(h.calls.filter(x=>x.type==='rpc').length,1);
});
test('invalid price or revision never reaches the database write',async()=>{
 for(const obj of [{...manual,cents:-1},{...manual,cents:1.9},
  {...manual,expectedRevision:-1},{...manual,source:'other'}]){
  const h=harness();
  const res=await h.post(obj);
  assert.equal(res.status,422);
  assert.equal(h.calls.some(x=>x.type==='rpc'),false);
 }
});
test('SQL function has restrictive service-role-only execute rights and one rollback boundary',()=>{
 const sql=read('supabase/migrations/20261110083900_lts_company_atomic_customer_tariff.sql');
 assert.match(sql,/security invoker/i);
 assert.match(sql,/revoke all on function[\s\S]*from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function[\s\S]*to service_role/i);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/p_expected_revision<>v_fare.revision/);
 assert.match(sql,/raise exception using errcode='P0001'/);
 assert.match(sql,/insert into public.lts_shared_maps_customers/);
 assert.match(sql,/insert into public.lts_shared_customers_manual/);
 assert.match(sql,/insert into public.lts_company_tariffs/);
 assert.doesNotMatch(sql,/delete from public\.lts_|update public\.lts_driver/i);
});
test('all three admin entry points use atomic action without two-request fallback',()=>{
 const maps=read('amministratore/company-maps-registration.mjs');
 const manual=read('amministratore/company-manual-registration.mjs');
 const editor=read('amministratore/company-rates.mjs');
 const client=read('shared-maps-client.mjs');
 assert.match(maps,/confirmed=await saveSharedPricedCustomer/);
 assert.doesNotMatch(maps,/await account\.companyTariffs\('save'/);
 assert.doesNotMatch(maps,/await saveSharedMapsCustomer\(/);
 assert.match(manual,/await saveSharedPricedCustomer\(\{source:'manual'/);
 assert.doesNotMatch(manual,/await account\.companyTariffs\('save'/);
 assert.match(editor,/else await saveSharedPricedCustomer/);
 assert.match(editor,/if\(editing\)await account\.companyTariffs\('save',payload\)/);
 assert.doesNotMatch(editor,/await saveSharedManualCustomer/);
 assert.match(client,/action:'save-priced'/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|sb_secret_/);
});
test('legacy special-route tariffs remain available without fabricated Maps sites',()=>{
 const handler=read('supabase/functions/lts-shared-maps/maps-registry-handler.mjs');
 assert.match(handler,/Existing dashboard-created company fares are also shared customer choices/);
 assert.match(handler,/const fallback=manualProjection\(\{name:fare.client,city:fare.city/);
});
