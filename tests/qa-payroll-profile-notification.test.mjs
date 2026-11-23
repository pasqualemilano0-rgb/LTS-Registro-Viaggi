import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countUnreadDocuments} from '../shared/payroll-unread.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const doc=(opened=null,category='cedolino')=>({
 state:'published',category,first_accessed_at:opened
});
test('badge counts only published PDFs without first access, across document categories',async()=>{
 const rows=[doc(null,'cedolino'),doc('2026-11-23T09:00:00Z','cu'),doc(null,'altri')];
 assert.equal(await countUnreadDocuments(async()=>({documents:rows})),2);
 assert.equal(await countUnreadDocuments(async()=>({documents:rows.map(d=>({...d,first_accessed_at:'2026-11-23T09:00:00Z'}))})),0);
 assert.equal(await countUnreadDocuments(async()=>({documents:[]})),0);
});
test('badge searches beyond the first 50 PDFs, including older unopened files',async()=>{
 const rows=Array.from({length:50},()=>doc('2026-11-23T09:00:00Z'));
 rows.push(doc(null,'cu'),doc(null,'altri'));
 const offsets=[];
 const result=await countUnreadDocuments(async({offset})=>{
  offsets.push(offset);return {documents:rows.slice(offset,offset+50)};
 });
 assert.equal(result,2);assert.deepEqual(offsets,[0,50]);
});
test('badge displays 99+ after 100 unread PDFs without unnecessary extra pages',async()=>{
 let calls=0;
 const result=await countUnreadDocuments(async()=>{
  calls++;return {documents:Array.from({length:50},()=>doc())};
 });
 assert.equal(result,100);assert.equal(calls,2);
});
test('badge fails closed for malformed responses or unpublished rows',async()=>{
 await assert.rejects(()=>countUnreadDocuments(async()=>({documents:null})),/non valido/);
 await assert.rejects(()=>countUnreadDocuments(async()=>({documents:[{...doc(),state:'draft'}]})),/non autorizzato/);
 await assert.rejects(()=>countUnreadDocuments(async()=>({documents:Array.from({length:51},()=>doc())})),/non valido/);
 await assert.rejects(()=>countUnreadDocuments(async()=>{throw Error('network') }),/network/);
});
test('avatar badge requires verified driver and active payroll configuration',()=>{
 const app=read('app.mjs'),css=read('app.css'),index=read('index.html');
 assert.match(app,/function documentBadgeAllowed\(\)/);
 assert.match(app,/store\.usingAccount\(\)&&accountAccess\.isVerified\(\)&&accountAccess\.getRole\(\)==='driver'/);
 assert.match(app,/runtimeConfig\.accountAuth\?\.payrollEndpoint/);
 assert.match(app,/unreadDocumentOwner===accountAccess\.getAccountId\(\)/);
 assert.match(app,/countUnreadDocuments\(listPayrollDocuments\)/);
 assert.match(app,/profile\.querySelector\('\.profile-document-badge'\)\?\.remove\(\)/);
 assert.match(app,/profile\.setAttribute\('aria-label'/);
 assert.match(app,/count>=100\?'99\+':String\(count\)/);
 assert.match(app,/if\(event\.persisted\)void refreshDocumentBadge\(true\)/);
 assert.match(app,/setInterval\(\(\)=>\{if\(!document\.hidden\)void refreshDocumentBadge\(\);\},60000\)/);
 assert.match(css,/\.profile-button \.profile-document-badge/);
 assert.match(css,/background:#d51f38/);
 assert.match(index,/app\.mjs\?v=20261123-payroll-badge-v1/);
});
test('read receipt comes from server-side PDF access, not visiting the profile menu',()=>{
 const app=read('app.mjs'),driver=read('documenti/driver-documents.mjs');
 const prod=read('supabase/functions/lts-payroll/index.ts');
 const qa=read('supabase/qa/functions/lts-payroll-secure-qa/index.ts');
 assert.match(driver,/await api\.download\(doc\.id\)/);
 assert.match(driver,/await api\.acknowledge\(doc\.id\)/);
 assert.match(prod,/lts_payroll_mark_first_access/);
 assert.match(qa,/lts_payroll_secure_qa_mark_first_access/);
 assert.match(app,/\/\/ Opening the profile menu alone does not clear notifications\./);
 assert.doesNotMatch(app,/localStorage\.setItem\(['"]payroll/i);
});
test('installed PWA precaches the imported badge modules for offline bootstrap',()=>{
 const sw=read('sw.js');
 for(const path of ['documenti/document-api.mjs','shared/payroll-unread.mjs']){
  assert.ok(sw.includes('"/LTS-Registro-Viaggi/'+path+'"'),path);
  assert.ok(sw.includes("BASE + '"+path+"'"),path+' must be network-first');
 }
 assert.match(sw,/20261123-payroll-badge-v1/);
});
