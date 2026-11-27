import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {integrateQaNoteCheck} from '../supabase/qa/integrate-qa-note-check.mjs';

const fixture=[
 '<section id="admin-mfa" hidden>',
 "$('admin-mfa').hidden=!state||state.role!=='admin';",
 ' state=null;',
 "['login','check','logout','enroll','verify','company-test']",
 "['login','check','logout','enroll','verify','company-test']",
 'restore();render();'
].join('\n');
const patched=integrateQaNoteCheck(fixture);
const start=patched.indexOf("$('note-test').addEventListener");
const end=patched.indexOf('restore();render();',start);
const script=patched.slice(start,end);

function harness({role='driver',foreign=false,badEndpoint=false}={}){
 let callback;
 const calls=[];
 const status={textContent:''};
 const state={user_id:'synthetic',role,access_token:'synthetic-token'};
 const sandbox={state,URL:'https://'+(badEndpoint?'wrong.invalid':'sywxretbfgwxwhvdcknq.supabase.co')+'/functions/v1/lts-phone-auth',globalThis:{URL},
  AbortController,setTimeout,clearTimeout,check:async()=>{},execute:fn=>fn(),
  $:id=>id==='note-test'?{addEventListener:(_event,fn)=>{callback=fn;}}:status,
  fetch:async(url,options)=>{
   const body=JSON.parse(options.body);
   calls.push({url,body,headers:options.headers});
   const data=body.action==='read'?{user:{id:'account:synthetic'},revision:1,state:{trips:[{id:'trip-one',note:'current',adminNote:'other'}]}}:
    {userId:'account:'+(foreign?'other':'synthetic'),tripId:'trip-one',rows:[{note_kind:'note',previous_note:'old',current_note:'current'}]};
   return {ok:true,json:async()=>data};
  }};
 vm.runInNewContext(script,sandbox);
 return {run:()=>callback(),calls,status};
}

test('protected QA check adds one control without modifying original handlers',()=>{
 assert.match(patched,/id="note-qa" hidden/);
 assert.equal(patched.split("'company-test','note-test'").length,3);
 assert.ok(patched.includes("$('admin-mfa').hidden=!state||state.role!=='admin';"));
 assert.throws(()=>integrateQaNoteCheck(patched));
 assert.throws(()=>integrateQaNoteCheck('unexpected source'));
});
test('live QA probe reads only the authenticated archive and its own history',async()=>{
 const h=harness();await h.run();
 assert.deepEqual(h.calls.map(x=>x.body.action),['read','note-history']);
 assert.ok(h.calls.every(x=>x.url==='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-account-state'));
 assert.ok(h.calls.every(x=>x.headers.Authorization==='Bearer synthetic-token'));
 assert.match(h.status.textContent,/PASS.*Nessuna scrittura/);
 assert.ok(!h.status.textContent.includes('current'));
});
test('QA probe rejects foreign owner, admin role and unexpected host',async()=>{
 for(const options of [{foreign:true},{role:'admin'},{badEndpoint:true}]){
  const h=harness(options);await assert.rejects(h.run());
  assert.ok(!h.status.textContent.includes('PASS'));
  assert.ok(h.calls.every(x=>['read','note-history'].includes(x.body.action)));
  if(!options.foreign)assert.equal(h.calls.length,0);
 }
});
