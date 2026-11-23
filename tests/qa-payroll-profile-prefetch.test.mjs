import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const start=app.indexOf('const PAYROLL_PROFILE_CHECK_INTERVAL_MS=');
const end=app.indexOf('function beginLtsRealtime(){',start);
assert.ok(start>0&&end>start,'in-memory eligibility helper present');
const code=app.slice(start,end)
 .replace("await import(new URL('documenti/document-api.mjs',import.meta.url).href)","await getApi()");

function fixture({authorized=true}={}){
 const state={owner:'driver-A',account:true,verified:true,role:'driver',online:true,auth:authorized,temporary:false};
 const time={ms:1000000,now(){return this.ms;}};
 let calls=0;
 const accountAccess={
  isEnabled:()=>true,
  isVerified:()=>state.verified,
  getRole:()=>state.role,
  getAccountId:()=>state.owner
 };
 const store={usingAccount:()=>state.account};
 const getApi=async()=>({documents:async()=>{
  calls++;
  if(state.temporary)throw Error('Failed to fetch: temporary network outage');
  if(!state.auth){
   const error=Error('Forbidden: not in allowlist');error.status=403;throw error;
  }
  return {documents:[]};
 }});
 const api=new Function('accountAccess','store','runtimeConfig','getApi','Date',
  code+'\nreturn {prefetchPayrollProfileAccess,payrollProfileCached,resetPayrollProfileAccess};')(
  accountAccess,store,{accountAuth:{payrollEndpoint:'https://private.example/api'}},getApi,time
 );
 return {state,time,api,calls:()=>calls};
}

test('successful preload is reused immediately for the same driver',async()=>{
 const x=fixture();
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 assert.equal(x.calls(),1);
 assert.equal(x.api.payrollProfileCached('driver-A'),true);
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 assert.equal(x.calls(),1,'opening Profile must not cause another API call');
 x.time.ms+=61000;
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 assert.equal(x.calls(),2,'eligibility refreshes periodically');
});

test('a denied, expired or failed server check never creates a menu permission',async()=>{
 const x=fixture({authorized:false});
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
 x.state.auth=true;
 x.time.ms+=61000;
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 assert.equal(x.calls(),1,'denied accounts must not poll every minute');
 x.time.ms+=540000;
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 assert.equal(x.api.payrollProfileCached('driver-A'),true);
 x.state.auth=false;
 assert.equal(await x.api.prefetchPayrollProfileAccess(true),false);
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
});

test('temporary network errors retry sooner than definitive 403 denials',async()=>{
 const x=fixture({authorized:false});
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 assert.equal(x.calls(),1);
 // Definitive 403 is throttled, not retried after one minute.
 x.time.ms+=61000;
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 assert.equal(x.calls(),1);
 const y=fixture({authorized:true});
 y.state.temporary=true;
 assert.equal(await y.api.prefetchPayrollProfileAccess(),false);
 assert.equal(y.calls(),1);
 y.state.temporary=false;
 y.time.ms+=31000;
 assert.equal(await y.api.prefetchPayrollProfileAccess(),true);
 assert.equal(y.calls(),2,'a transient failure is retried after 30 seconds');
});
test('verified driver B never inherits driver A authorization',async()=>{
 const x=fixture();
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 x.state.owner='driver-B';x.state.auth=false;
 assert.equal(x.api.payrollProfileCached('driver-B'),false);
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 assert.equal(x.api.payrollProfileCached('driver-B'),false);
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
});

test('logout, failed verification or admin role prevent cached access',async()=>{
 const x=fixture();
 assert.equal(await x.api.prefetchPayrollProfileAccess(),true);
 x.state.verified=false;
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
 assert.equal(await x.api.prefetchPayrollProfileAccess(),false);
 x.state.verified=true;x.state.role='admin';
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
 x.state.role='driver';x.state.account=false;
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
 x.api.resetPayrollProfileAccess();
 x.state.account=true;
 assert.equal(x.api.payrollProfileCached('driver-A'),false);
});

test('a late response from the previous account cannot restore its menu permission',async()=>{
 let current='A',resolveA,resolveB;
 const state={verified:true,role:'driver'};
 const accountAccess={isEnabled:()=>true,isVerified:()=>state.verified,
  getRole:()=>state.role,getAccountId:()=>current};
 const store={usingAccount:()=>true};
 const getApi=async()=>({documents:()=>new Promise(resolve=>{
  if(current==='A')resolveA=resolve;else resolveB=resolve;
 })});
 const api=new Function('accountAccess','store','runtimeConfig','getApi','Date',
  code+'\nreturn {prefetchPayrollProfileAccess,payrollProfileCached};')(
  accountAccess,store,{accountAuth:{payrollEndpoint:'https://private.example/api'}},getApi,Date
 );
 const a=api.prefetchPayrollProfileAccess();
 await Promise.resolve();await Promise.resolve();
 current='B';
 const b=api.prefetchPayrollProfileAccess();
 await Promise.resolve();await Promise.resolve();
 assert.equal(typeof resolveA,'function');assert.equal(typeof resolveB,'function');
 resolveB({documents:[]});
 assert.equal(await b,true);
 resolveA({documents:[]});
 assert.equal(await a,false);
 assert.equal(api.payrollProfileCached('A'),false);
 assert.equal(api.payrollProfileCached('B'),true);
});

test('profile prefetch happens at bootstrap and verified resume, not on click',()=>{
 const before=app.slice(0,app.indexOf('function beginLtsRealtime(){'));
 const profile=app.slice(app.indexOf('function openProfile(required=false){'),
   app.indexOf('function archiveSummary(',app.indexOf('function openProfile(required=false){')));
 assert.match(before,/payrollProfileAccess\.owner===owner&&payrollProfileAccess\.allowed/);
 assert.match(profile,/if\(payrollProfileCached\(accountOwner\)\)showAuthorizedDocuments\(true\)/);
 assert.match(profile,/void prefetchPayrollProfileAccess\(\)\.then\(showAuthorizedDocuments\)/);
 assert.match(app,/lastDriverVerifiedAt=Date\.now\(\);\s*void prefetchPayrollProfileAccess\(\)/);
 assert.match(app,/driverSessionShield\.close\(\);\s*void prefetchPayrollProfileAccess\(payrollProfileAccess\.allowed\)/);
 assert.match(app,/function renderAccountGate\(message=''\)\{\s*resetPayrollProfileAccess\(\)/);
 assert.match(app,/if\(changedIdentity\)\{\s*resetPayrollProfileAccess\(\)/);
 assert.doesNotMatch(before,/localStorage|sessionStorage|indexedDB/);
});
