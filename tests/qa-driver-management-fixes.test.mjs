/** Offline contract + unit tests for driver-management race and revoke handling.
 * No production credentials or archived driver data are used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const backend=read('supabase/functions/lts-driver-onboarding/core.mjs');

function isolatedHandler(name,nextName){
 const start=backend.indexOf('async function '+name+'(');
 const end=backend.indexOf('async function '+nextName+'(',start);
 assert(start>=0&&end>start,'Cannot locate '+name);
 const code=backend.slice(start,end);
 const json=(value,status=200)=>({value,status});
 return new Function('normalizedPhone','json',code+';return '+name)(x=>x,json);
}
function mockDb(data,error=null){
 const chain={
  update:()=>chain,eq:()=>chain,is:()=>chain,gt:()=>chain,
  select:async()=>({data,error})
 };
 return {from:()=>chain};
}
test('revoking an already used invitation must NOT claim success',async()=>{
 const revoke=isolatedHandler('revokeInvite','removePending');
 const missing=await revoke(mockDb([]),{phone:'+393331111111'});
 assert.equal(missing.status,409);
 assert.match(missing.value.error,/già utilizzato o annullato/i);
 const valid=await revoke(mockDb([{id:'one'}]),{phone:'+393331111111'});
 assert.equal(valid.status,200);
 assert.deepEqual(valid.value,{ok:true,revoked:1});
});
test('revoking an already completed password reset must NOT claim success',async()=>{
 const revoke=isolatedHandler('revokeReset','setAccess');
 const missing=await revoke(mockDb([]),{phone:'+393331111111'});
 assert.equal(missing.status,409);
 const valid=await revoke(mockDb([{id:'one'},{id:'two'}]),{phone:'+393331111111'});
 assert.equal(valid.status,200);
 assert.equal(valid.value.revoked,2);
});
test('roster queries do not silently truncate account and invitation history',()=>{
 assert.match(backend,/const MAX_DRIVERS = 200/);
 assert.match(backend,/const MAX_HISTORY = 4000/);
 assert.match(backend,/gt\('expires_at',new Date\(\)[.]toISOString\(\)\)/);
 assert.match(backend,/limit\(MAX_DRIVERS\+1\)/);
 assert.match(backend,/limit\(MAX_HISTORY\+1\)/);
 assert.match(backend,/length>MAX_HISTORY/);
});
test('driver admin editor prevents stale owner and unsaved form races',()=>{
 const editor=read('amministratore/driver-records.mjs');
 const report=read('amministratore/report.mjs');
 const html=read('amministratore/index.html');
 const admin=read('amministratore/admin.mjs');
 for(const pattern of [
  /formSnapshot\(form\)!==editorBaseline/,
  /window[.]confirm\('Ci sono modifiche non salvate/,
  /render\(\{keepEditor:true\}\)/,
  /driverId:owner,expectedRevision/,
  /token!==epoch\|\|owner!==selectedId/,
  /navigation=\[choose,filter,add/,
  /finally\{if\(token===epoch\)\{loading=false;refresh[.]disabled=false;/,
  /choose[.]value=selectedId;return;/,
  /Nessun altro archivio è stato aperto/
 ])assert.match(editor,pattern);
 assert.match(report,/lastView==='records'&&view!=='records'&&!records[.]canLeave\(\)/);
 assert.match(html,/admin[.]mjs[?]v=20261109-customer-trip-sync-v1/);
 assert.match(admin,/report[.]mjs[?]v=20261109-customer-trip-sync-v1/);
 assert.match(report,/driver-records[.]mjs[?]v=20261109-customer-trip-sync-v1/);
});
test('onboarding changes broadcast only a private data-free roster hint',()=>{
 const sql=read('supabase/migrations/20261107161500_lts_private_admin_roster_realtime_notices.sql');
 const bridge=read('realtime-client.mjs');
 const admin=read('amministratore/admin.mjs');
 for(const name of ['lts_account_access','lts_pending_drivers','lts_driver_invites','lts_driver_credential_resets'])
  assert.match(sql,new RegExp('on public[.]'+name));
 assert.match(sql,/realtime[.]send\('\{"kind":"roster"\}'::jsonb,'changed','lts:v1:admin',true\)/);
 assert.match(bridge,/new Set\(\['archive','catalog','roster'\]\)/);
 assert.match(admin,/if\(kind==='roster'\|\|kind==='ready'\)/);
 assert.match(admin,/loadDrivers\(\{silent:true\}\)/);
});
