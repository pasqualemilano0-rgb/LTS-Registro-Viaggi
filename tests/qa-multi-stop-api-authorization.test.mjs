import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCompanyTariffs} from '../supabase/functions/lts-company-tariffs/tariff-handler.mjs';

const ORIGIN='https://pasqualemilano0-rgb.github.io';
const ADMIN='11111111-1111-4111-8111-111111111111';
const DRIVER='22222222-2222-4222-8222-222222222222';
const FACTOR='33333333-3333-4333-8333-333333333333';
const SESSION='44444444-4444-4444-8444-444444444444';
const bearer=(aal,role)=>[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({aal,session_id:SESSION,role})).toString('base64url'),
 'S'.repeat(48)
].join('.');
const adminToken=bearer('aal2','admin');
const adminAal1=bearer('aal1','admin');
const driverToken=bearer('aal1','driver');
const extraKeys=['facchinaggioBilico','facchinaggioReefer','reefer','adr',
 'pernotto','sabatoPorto','sabatoTrasferta','preOrario'];

function fakeBackend(){
 const pairs=[];
 const extras=extraKeys.map(service_key=>({service_key,cents:service_key==='preOrario'?0:null,revision:1}));
 let sessionActive=true,verifiedFactor=true;
 let next=1;
 const accounts={
  [ADMIN]:{user_id:ADMIN,role:'admin',enabled:true,removed_at:null},
  [DRIVER]:{user_id:DRIVER,role:'driver',enabled:true,removed_at:null}
 };
 const adminClient={
  rpc:async (name)=>name==='lts_session_is_active'
   ?{data:sessionActive,error:null}:name==='lts_admin_verified_totp_factor'
   ?{data:verifiedFactor?FACTOR:null,error:null}:{data:null,error:{code:'undefined'}},
  from(table){
   let filters=[],mode='read',payload,cap=501;
   const query={
    select(){return this},
    order(){return this},
    limit(n){cap=n;return this},
    eq(key,value){filters.push([key,value]);return this},
    update(data){mode='update';payload=data;return this},
    insert(data){mode='insert';payload=data;return this},
    async maybeSingle(){const {data,error}=await this.result();return {data:data?.[0]??null,error}},
    async single(){const {data,error}=await this.result();return {data:data?.[0]??null,error}},
    then(resolve,reject){return this.result().then(resolve,reject)},
    async result(){
     const source=table==='lts_account_access'?Object.values(accounts)
      :table==='lts_company_multi_stop_fares'?pairs
      :table==='lts_company_tariffs'?[]
      :table==='lts_company_extra_rates'?extras:null;
     if(!source)return {data:null,error:{code:'unknown_table'}};
     const find=()=>source.filter(row=>filters.every(([key,value])=>row[key]===value));
     if(mode==='read')return {data:structuredClone(find().slice(0,cap)),error:null};
     if(table!=='lts_company_multi_stop_fares')return {data:null,error:{code:'denied'}};
     if(mode==='insert'){
      if(pairs.some(row=>['client','city','second_client','second_city'].every(k=>row[k]===payload[k])))
       return {data:null,error:{code:'23505'}};
      const created={id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(next++).padStart(12,'0'),
       revision:1,...payload};
      pairs.push(created);return {data:[structuredClone(created)],error:null};
     }
     if(mode==='update'){
      const existing=find()[0];
      if(!existing)return {data:[],error:null};
      Object.assign(existing,payload);
      return {data:[structuredClone(existing)],error:null};
     }
     return {data:null,error:{code:'unexpected'}};
    }
   };
   return query;
  }
 };
 const publicClient={auth:{getUser:async token=>{
  if(token===adminToken||token===adminAal1)return {data:{user:{id:ADMIN}},error:null};
  if(token===driverToken)return {data:{user:{id:DRIVER}},error:null};
  return {data:{user:null},error:{message:'invalid'}};
 }}};
 return {getClients:()=>({public:publicClient,admin:adminClient}),pairs,accounts,
  revokeSession:()=>{sessionActive=false},
  resetSession:()=>{sessionActive=true},
  removeAdminMfa:()=>{verifiedFactor=false}};
}
async function invoke(db,token,body,origin=ORIGIN){
 const request=new Request('https://local.example.test/lts-company-tariffs',{
  method:'POST',headers:{origin,'content-type':'application/json',
   ...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const response=await handleCompanyTariffs(request,{getClients:db.getClients});
 return {status:response.status,data:await response.json()};
}
const pair={action:'multi-save',client:'Cliente Alfa',city:'Napoli',
 secondClient:'Cliente Beta',secondCity:'Caserta',cents:21000,enabled:true};

test('admin alone sets an ordered pair, driver only reads the approved fare',async()=>{
 const db=fakeBackend();
 assert.equal((await invoke(db,driverToken,pair)).status,403);
 let r=await invoke(db,adminToken,pair);
 assert.equal(r.status,200);
 assert.equal(r.data.multiStopRate.cents,21000);
 assert.equal(r.data.multiStopRate.revision,1);
 r=await invoke(db,driverToken,{action:'list'});
 assert.equal(r.status,200);
 assert.deepEqual(r.data.multiStopRates.map(p=>[p.client,p.city,p.secondClient,p.secondCity,p.cents]),[
  ['CLIENTE ALFA','NAPOLI','CLIENTE BETA','CASERTA',21000]]);
 assert.equal(r.data.tariffs.length,0);
 assert.equal(r.data.extraRates.length,8);
 assert.equal((await invoke(db,adminToken,pair)).status,409);
 assert.equal(db.pairs.length,1);
});

test('disabled pair disappears for drivers; admin can still revise or reactivate it',async()=>{
 const db=fakeBackend();
 const created=(await invoke(db,adminToken,pair)).data.multiStopRate;
 const disabled={...pair,id:created.id,expectedRevision:1,enabled:false,cents:22000};
 let r=await invoke(db,adminToken,disabled);
 assert.equal(r.status,200);
 assert.equal(r.data.multiStopRate.revision,2);
 assert.equal((await invoke(db,driverToken,{action:'list'})).data.multiStopRates.length,0);
 assert.equal((await invoke(db,adminToken,{action:'list'})).data.multiStopRates[0].enabled,false);
 assert.equal((await invoke(db,adminToken,{...disabled,expectedRevision:1,enabled:true})).status,409);
 assert.equal((await invoke(db,adminToken,{...disabled,expectedRevision:2,enabled:true})).status,200);
 assert.equal((await invoke(db,driverToken,{action:'list'})).data.multiStopRates[0].cents,22000);
});

test('server keeps rejecting invalid admin MFA, session, origin and bearer',async()=>{
 const db=fakeBackend();
 assert.equal((await invoke(db,adminAal1,pair)).status,428);
 assert.equal((await invoke(db,adminToken,pair,'https://evil.example')).status,403);
 assert.equal((await invoke(db,null,pair)).status,401);
 assert.equal((await invoke(db,'arbitrary-token',pair)).status,401);
 db.revokeSession();
 assert.equal((await invoke(db,driverToken,{action:'list'})).status,403);
 db.resetSession();
 db.removeAdminMfa();
 assert.equal((await invoke(db,adminToken,pair)).status,428);
 assert.equal(db.pairs.length,0);
});

test('driver cannot change price and invalid pairs are rejected even for admin',async()=>{
 const db=fakeBackend();
 assert.equal((await invoke(db,driverToken,{...pair,enabled:false,cents:1})).status,403);
 assert.equal((await invoke(db,adminToken,{...pair,cents:-1})).status,422);
 assert.equal((await invoke(db,adminToken,{...pair,cents:1.5})).status,422);
 assert.equal((await invoke(db,adminToken,{...pair,secondClient:'Cliente Alfa',secondCity:'Napoli'})).status,422);
 assert.equal((await invoke(db,adminToken,{...pair,enabled:'yes'})).status,422);
 assert.equal(db.pairs.length,0);
});
