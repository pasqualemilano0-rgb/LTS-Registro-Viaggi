import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redactCompanyReportSource} from '../supabase/qa/f52-report-note-privacy.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('F52 report uses administrative note only and fails on unrecognized baseline',()=>{
 const source="services:[...trip.services],note:trip.note||'',totalCents:value,";
 const next=redactCompanyReportSource(source);
 assert.ok(next.includes("adminNote:trip.adminNote||''"));
 assert.ok(!next.includes('trip.note'));
 assert.throws(()=>redactCompanyReportSource(next));
});
test('F52 administrative archive response redacts personal notes, mutation keeps original state',()=>{
 const src=read('server/admin-records-core.mjs');
 const start=src.indexOf('export function redactAdminArchive('),end=src.indexOf('async function drivers(',start);
 const redact=new Function(src.slice(start,end).replace('export function','function')+';return redactAdminArchive;')();
 const original={trips:[{id:'t',note:'PERSONAL SECRET',adminNote:'ADMIN',fareCents:7500}]};
 assert.deepEqual(redact(original).trips,[{id:'t',note:'',adminNote:'ADMIN',fareCents:7500}]);
 assert.equal(original.trips[0].note,'PERSONAL SECRET');
 assert.ok(src.includes('state:redactAdminArchive(patched.state)'));
 assert.ok(src.includes('state:redactAdminArchive(data.state)'));
 assert.ok(src.includes('p_new_payload:patched.state'));
 const pure=read('shared/admin-record-operations.mjs');
 assert.ok(pure.includes("'secondCity','adminNote','services'"));
 assert.ok(!pure.includes("'secondCity','note','services'"));
});
