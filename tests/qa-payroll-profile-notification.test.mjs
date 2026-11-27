import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countUnreadDocuments} from '../shared/payroll-unread.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const opened='2026-11-23T09:00:00Z';
const doc=(id,first_accessed_at=null,category='cedolino',driver_id='A')=>({id,state:'published',category,first_accessed_at,driver_id});
const count=(documents)=>countUnreadDocuments(async()=>({documents}),{owner:'account:A'});
test('badge counts published unopened PDFs across categories, not acknowledgement alone',async()=>{
 assert.equal(await count([doc('1'),doc('2',opened,'cu'),{...doc('3',null,'altri'),acknowledged_at:opened}]),2);
 assert.equal(await count([doc('1',opened)]),0);
 assert.equal(await count([]),0);
});
test('badge reuses first page, scans older documents without duplicate requests',async()=>{
 const rows=Array.from({length:50},(_,i)=>doc(String(i),opened));
 rows.push(doc('50',null,'cu'),doc('51',null,'altri'));
 const offsets=[];
 const result=await countUnreadDocuments(async({offset})=>{offsets.push(offset);return {documents:rows.slice(offset,offset+50)};},
 {owner:'account:A',firstPage:{documents:rows.slice(0,50)}});
 assert.equal(result,2);assert.deepEqual(offsets,[50]);
});
test('badge caps at 100 and validates the entire last page before returning',async()=>{
 const rows=Array.from({length:150},(_,i)=>doc(String(i)));
 let calls=0;
 assert.equal(await countUnreadDocuments(async({offset})=>{calls++;return {documents:rows.slice(offset,offset+50)};},{owner:'account:A'}),100);
 assert.equal(calls,2);
 rows[99]={...rows[99],driver_id:'B'};
 await assert.rejects(()=>countUnreadDocuments(async({offset})=>({documents:rows.slice(offset,offset+50)}),{owner:'account:A'}),/non autorizzato/);
});
test('badge rejects malformed, draft, revoked, foreign, duplicate and missing access data',async()=>{
 for(const documents of [null,[{...doc('1'),state:'draft'}],[{...doc('1'),state:'revoked'}],[doc('1',null,'cu','B')],[doc('1'),doc('1')],[{...doc('1'),first_accessed_at:undefined}],[doc('1','invalid')],Array.from({length:51},(_,i)=>doc(String(i)))])
  await assert.rejects(()=>count(documents));
 await assert.rejects(()=>countUnreadDocuments(async()=>{throw Error('network')},{owner:'account:A'}),/network/);
});
test('duplicates on later pages cannot inflate count',async()=>{
 const first=Array.from({length:50},(_,i)=>doc(String(i)));
 await assert.rejects(()=>countUnreadDocuments(async()=>({documents:[doc('1')]}),{owner:'account:A',firstPage:{documents:first}}),/duplicato/);
});
test('badge is red, accessible, memory-only and tied to existing account permission',()=>{
 const app=read('app.mjs'),css=read('app.css');
 assert.match(app,/function payrollProfileUnread\(owner\)/);
 assert.match(app,/payrollProfileCached\(owner\)\?payrollProfileAccess\.unread:null/);
 assert.match(app,/owner===accountAccess\.getAccountId\(\)&&payrollProfileEligible\(\)/);
 assert.match(app,/profile\.querySelector\('\.profile-document-badge'\)\?\.remove\(\)/);
 assert.match(app,/profile\.setAttribute\('aria-label'/);
 assert.match(app,/count>=100\?'99\+':String\(count\)/);
 assert.match(css,/\.profile-button \.profile-document-badge/);
 assert.match(css,/background:#d51f38/);
 const access=app.slice(app.indexOf('const PAYROLL_PROFILE_CHECK_INTERVAL_MS'),app.indexOf('function beginLtsRealtime'));
 assert.doesNotMatch(access,/localStorage|sessionStorage|indexedDB/);
});
test('first access remains a server-side PDF event, not opening the profile or confirming availability',()=>{
 for(const path of ['supabase/functions/lts-payroll/index.ts','supabase/qa/functions/lts-payroll-secure-qa/index.ts']){
  const backend=read(path);
  assert.match(backend,/\.eq\('driver_id',actor\.userId\)\.eq\('state','published'\)/);
  assert.match(backend,/first_accessed_at/);
  assert.match(backend,/mark_first_access/);
 }
 const app=read('app.mjs');
 const access=app.slice(app.indexOf('const PAYROLL_PROFILE_CHECK_INTERVAL_MS'),app.indexOf('function beginLtsRealtime'));
 assert.doesNotMatch(access,/\.download\(|\.acknowledge\(/);
});
test('offline cache contains only the pure helper and does not intercept private document routes',()=>{
 const sw=read('sw.js');
 assert.match(sw,/"\/LTS-Registro-Viaggi\/shared\/payroll-unread\.mjs"/);
 assert.match(sw,/BASE \+ 'shared\/payroll-unread\.mjs'/);
 assert.doesNotMatch(sw,/"\/LTS-Registro-Viaggi\/documenti\//);
 assert.match(sw,/\['documenti','viaggi\/documenti'\].*return;/);
 assert.match(sw,/request\.method !== 'GET'/);
 assert.match(read('index.html'),/app\.mjs\?v=[^" ]+payroll-badge-v2/);
});
