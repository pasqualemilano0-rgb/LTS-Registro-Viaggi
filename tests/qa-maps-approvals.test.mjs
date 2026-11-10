import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {submitMapsProposal,mapsApprovalList,decideMapsApproval} from
 '../supabase/functions/lts-shared-maps/maps-approvals.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='6ac65338-5488-4fba-97cf-6d4ca0e5a015',uid='0ff301da-356f-4dd0-b427-4f65fb1626cd';
const site={name:'TEST CLIENTE',city:'NAPOLI',address:'VIA ROMA 1',mapsUrl:'https://maps.google.com/maps?q=test'};
const siteKey='a'.repeat(64);
test('Driver Maps submission is a request, not an immediate company customer',async()=>{
 let inserted;
 const db={from(name){assert.equal(name,'lts_maps_approval_requests');return {
  insert(row){inserted=row;return {select(){return {maybeSingle:async()=>({data:{id},error:null})}}}}
 }}};
 const result=await submitMapsProposal(db,site,siteKey,uid);
 assert.deepEqual(result,{pending:true,requestId:id});
 assert.equal(inserted.submitted_by,uid);
 assert.equal(inserted.maps_url,site.mapsUrl);
 assert.equal(inserted.site_key,siteKey);
});
test('Repeated proposals reuse pending site without duplicate insertion',async()=>{
 const calls=[];
 const chain={
  select(){return this;},eq(key,value){calls.push([key,value]);return this;},
  async maybeSingle(){return {data:{id},error:null};}
 };
 const db={from(){return {insert(){return {select(){return {maybeSingle:async()=>
  ({error:{code:'23505'},data:null})}}}},select(){return chain;}}}};
 const result=await submitMapsProposal(db,site,siteKey,uid);
 assert.equal(result.pending,true);assert.equal(result.requestId,id);
 assert.deepEqual(calls,[['status','pending'],['site_key',siteKey]]);
});
test('Queue with admin-only backend includes submitter label and uses bounded list',async()=>{
 const req={id,name:site.name,city:site.city,address:site.address,
  maps_url:site.mapsUrl,submitted_by:uid,submitted_at:'2026-11-10T05:30:00Z'};
 const db={from(table){
  if(table==='lts_maps_approval_requests')return {
   select(){return this;},eq(){return this;},order(){return this;},
   async limit(value){assert.equal(value,100);return {data:[req],error:null}}};
  if(table==='lts_account_access')return {select(){return this;},
   async in(key,values){assert.equal(key,'user_id');assert.deepEqual(values,[uid]);
    return {data:[{user_id:uid,phone_e164:'+390001234567'}],error:null}}};
  throw Error(table);
 }};
 const list=await mapsApprovalList(db);
 assert.equal(list.length,1);assert.equal(list[0].driver,'+390001234567');
 assert.equal(list[0].mapsUrl,site.mapsUrl);
 assert.equal(list[0].status,undefined);
});
test('Approval enforces amount and passes admin identity to atomic server RPC',async()=>{
 let args;
 const db={rpc(name,values){assert.equal(name,'lts_maps_approve_request');
  args=values;return Promise.resolve({data:{approved:true},error:null});}};
 assert.deepEqual(await decideMapsApproval(db,{id,decision:'approve',cents:8550},uid),{approved:true});
 assert.deepEqual(args,{p_request_id:id,p_admin_id:uid,p_cents:8550});
 await assert.rejects(()=>decideMapsApproval(db,{id,decision:'approve',cents:-1},uid));
});
test('Reject changes only pending request; already reviewed request is a conflict',async()=>{
 let keys=[];
 const chain={update(){return this;},eq(k,v){keys.push([k,v]);return this;},
  select(){return this;},async maybeSingle(){return {data:{id},error:null}}};
 const db={from(table){assert.equal(table,'lts_maps_approval_requests');return chain}};
 assert.deepEqual(await decideMapsApproval(db,{id,decision:'reject'},uid),{rejected:true});
 assert.deepEqual(keys,[['id',id],['status','pending']]);
 const conflict={from(){return {update(){return this;},eq(){return this;},
  select(){return this;},async maybeSingle(){return {data:null,error:null}}}}};
 await assert.rejects(()=>decideMapsApproval(conflict,{id,decision:'reject'},uid),err=>err.status===409);
});
test('Role and MFA remain mandatory; proposal never enters shared list before admin decision',()=>{
 const backend=read('supabase/functions/lts-shared-maps/maps-registry-handler.mjs');
 const app=read('app.mjs'),dashboard=read('amministratore/index.html');
 assert.match(backend,/if\(role!=='admin'\)throw \{status:403\}/);
 assert.match(backend,/requireAdminMfa/);
 assert.match(backend,/return json\(await submitMapsProposal\(db,parsed,siteKey,userId\),202,origin\)/);
 assert.match(backend,/if\(role==='driver'\)/);
 assert.match(app,/shared\.pending\?/);
 assert.match(dashboard,/id="maps-approvals"/);
 assert.match(dashboard,/id="maps-approvals-count"/);
 assert.match(dashboard,/control-center-v10\.css/);
 assert.match(read('amministratore/admin.mjs'),/mapsApprovals\.load/);
 assert.doesNotMatch(read('amministratore/maps-approvals.mjs'),/innerHTML/);
});
