import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const auth=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
const start=auth.indexOf('async function api(which,body,bearer=null){');
const end=auth.indexOf('\nasync function refresh(){',start);
assert.ok(start>=0&&end>start);
const code=auth.slice(start,end);
function harness(fetchImpl,online=true){
 const state={aborted:false};
 class FakeController{signal=state;abort(){state.aborted=true;}}
 const context={navigator:{onLine:online},AbortController:FakeController,
  setTimeout:()=>1,clearTimeout:()=>{},fetch:fetchImpl,
  url:()=> 'https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth'};
 vm.runInNewContext(code+'\nthis.callApi=api;',context);
 return {call:context.callApi,state};
}
test('successful authenticated driver session passes through without token logging',async()=>{
 let called=false;
 const h=harness(async (url,opts)=>{
  called=true;assert.equal(opts.headers.Authorization,'Bearer DRIVER_TOKEN');
  assert.equal(opts.credentials,'omit');assert.equal(opts.mode,'cors');
  assert.equal(opts.redirect,'error');
  return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({active:true,role:'driver',user_id:'driver-1'})};
 });
 assert.equal((await h.call('loginEndpoint',{action:'session'},'DRIVER_TOKEN')).role,'driver');
 assert.ok(called);
});
test('rejected fetch is AUTH-FETCH, not proof of offline',async()=>{
 const h=harness(async()=>{throw new TypeError('Failed to fetch')});
 await assert.rejects(h.call('loginEndpoint',{action:'session'},'SECRET'),e=>
  e.serviceUnavailable===true&&e.status===503&&e.authTransportCode==='AUTH-FETCH'&&!e.message.includes('SECRET'));
});
test('aborted fetch is AUTH-TIMEOUT',async()=>{
 let h;
 h=harness(async()=>{h.state.aborted=true;throw Object.assign(new Error('aborted'),{name:'AbortError'});});
 await assert.rejects(h.call('loginEndpoint',{action:'session'},'SECRET'),e=>e.authTransportCode==='AUTH-TIMEOUT');
});
test('HTTP denial is not retried or reclassified as network',async()=>{
 const h=harness(async()=>({ok:false,status:403,headers:{get:()=> 'application/json'},json:async()=>({error:'denied'})}));
 await assert.rejects(h.call('loginEndpoint',{action:'session'},'SECRET'),e=>e.status===403&&e.serviceUnavailable!==true);
});
test('UI exposes fixed codes, not raw errors or credentials',()=>{
 assert.match(app,/LTS_BOOKING_AUTH_TIMEOUT:'AUTH-TIMEOUT'/);
 assert.match(app,/LTS_BOOKING_AUTH_NETWORK:'AUTH-FETCH'/);
 assert.match(app,/accessToken=await getBookingBearerForServerVerification\(\)/);
 assert.match(app,/Authorization:'Bearer '\+accessToken/);
});
