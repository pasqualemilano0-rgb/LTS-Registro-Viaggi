/**
 * Regression contract: a cedolino cannot be served before an explicit
 * server-recorded availability confirmation by its verified owner.
 * Synthetic/static safety test; authenticated QA E2E remains mandatory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sourceFiles=[
 'supabase/functions/lts-payroll/index.ts',
 'supabase/qa/functions/lts-payroll-secure-qa/index.ts'
];
const databaseFiles=[
 'supabase/migrations/20261118_private_payroll_documents.sql',
 'supabase/qa/20261122_secure_payroll_qa.sql'
];

test('both edge APIs refuse PDF bytes without persisted cedolino confirmation',()=>{
 for(const path of sourceFiles){
  const src=read(path);
  const download=src.slice(src.indexOf('async function download('),src.indexOf('async function acknowledge('));
  const gate=download.indexOf("data.category==='cedolino'&&!data.acknowledged_at");
  const storage=download.indexOf('.storage.from(BUCKET).download(');
  const rpc=download.indexOf('_mark_first_access');
  assert.ok(gate>0 && storage>gate && rpc>storage,path+': gate before storage and first-access RPC');
  assert.match(download,/data\.driver_id!==actor\.userId\|\|data\.state!=='published'/);
  assert.match(download,/if\(!at\)fail\(409/);
  const ack=src.slice(src.indexOf('async function acknowledge('),src.indexOf('Deno.serve('));
  assert.match(ack,/if\(actor\.role!=='driver'\)fail\(403\)/);
  assert.match(ack,/p_document_id:id,p_driver_id:actor\.userId/);
  assert.doesNotMatch(ack,/Apri prima il tuo cedolino/);
 }
});

test('DB requires prior receipt for cedolino PDF access but not to record the receipt',()=>{
 for(const path of databaseFiles){
  const sql=read(path);
  assert.match(sql,/category <> 'cedolino' or acknowledged_at is not null/);
  assert.match(sql,/category='cedolino' and published_at is not null/);
  assert.match(sql,/and \(category <> 'cedolino' or acknowledged_at is not null\)/);
  const acknowledge=sql.match(/create or replace function public\.lts_payroll(?:_secure_qa)?_acknowledge[\s\S]*?\$\$;/)?.[0];
  assert.ok(acknowledge,'acknowledge RPC in '+path);
  assert.doesNotMatch(acknowledge,/and first_accessed_at is not null/);
  assert.match(acknowledge,/and state='published'\s+returning acknowledged_at/);
  assert.match(sql,/revoke all on function public\.lts_payroll/);
 }
 const qaMigration=read('supabase/qa/20261122_confirm_before_payslip_pdf_qa.sql');
 assert.match(qaMigration,/drop constraint payroll_receipt_consistent/);
 assert.match(qaMigration,/first_accessed_at is not null and acknowledged_at is null/);
 assert.match(qaMigration,/from public,anon,authenticated/);
 assert.match(qaMigration,/to service_role/);
});

test('driver UI confirms before requesting PDF, and has no post-view confirmation shortcut',()=>{
 const src=read('documenti/driver-documents.mjs');
 const ack=src.indexOf('await api.acknowledge(doc.id)');
 const pdf=src.indexOf('const file=await api.download(doc.id)');
 assert.ok(ack>=0 && pdf>ack,'confirm API must precede the PDF API');
 assert.match(src,/if\(doc\.category==='cedolino'&&!doc\.acknowledged_at\)/);
 assert.doesNotMatch(src,/confirm\.disabled=!doc\.first_accessed_at/);
 assert.match(read('documenti/index.html'),/Senza conferma il PDF rimane bloccato/);
});
