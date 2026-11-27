import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const edge=read('supabase/functions/lts-payroll/index.ts');
const admin=read('documenti/admin-documents.mjs');
const login=read('amministratore/buste-paga/index.html');
const selector=read('amministratore/index.html');
const preview=read('amministratore/buste-paga/anteprima/index.html');
const documents=read('documenti/driver-documents.mjs');
const migration=read('supabase/migrations/20261118_private_payroll_documents.sql');

test('the control-center administrative link uses the secured document workspace',()=>{
 assert.match(selector,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(selector,/Cedolini, CU, pubblicazione PDF e archivio riservato/);
 assert.match(selector,/Accesso amministratore e MFA già verificati/);
 assert.match(login,/id="login-form"/);
 assert.match(login,/id="mfa-form"/);
 assert.match(login,/id="workspace" hidden/);
 assert.match(login,/admin-documents\.mjs\?v=20261127-unified-login-qa-v1/);
 assert.match(login,/href="\.\/anteprima\/"/);
 assert.match(preview,/script-src 'none'/);
 assert.match(preview,/connect-src 'none'/);
});

test('all operational administrative endpoints still require live JWT, role and MFA',()=>{
 assert.match(edge,/const PAYROLL_ADMIN_OPERATIONS_ENABLED=true/);
 assert.match(edge,/const PAYROLL_PILOT_LIST_ONLY=true/);
 assert.match(edge,/auth\.getUser\(match\[1\]\)/);
 assert.match(edge,/await checkLtsSession\(api\.db,match\[1\],userId\)/);
 assert.match(edge,/if\(access\.role==='admin'\)\{\s*const mfa=await requireAdminMfa/);
 assert.match(edge,/if\(!mfa\?\.enrolled\|\|!mfa\?\.verified\)fail\(428\)/);
 assert.match(edge,/if\(access\.role==='driver'\)await requirePhase2Tester/);
 assert.match(edge,/if\(!PAYROLL_ADMIN_OPERATIONS_ENABLED\|\|actor\.role!=='admin'\)/);
 for(const action of ['drivers','list','publish','revoke','download','acknowledge'])
  assert.match(edge,new RegExp("if\\(input\\.action==='"+action+"'\\)"));
 assert.match(edge,/return json\(await upload\(req,api\.db,actor\),201\)/);
});

test('a document may only be published while its test recipient can access the list',()=>{
 const publish=edge.slice(edge.indexOf('async function publish('),edge.indexOf('async function revokeDocument('));
 const target=publish.indexOf('await activeDriver(db,doc.driver_id)');
 const check=publish.indexOf("await requirePhase2Tester(db,doc.driver_id,'driver')");
 const write=publish.indexOf("state:'published'");
 assert.ok(target>=0&&check>target&&write>check);
 assert.match(admin,/publish\.disabled=true/);
 assert.match(admin,/if\(!recipient\?\.documents_enabled\)/);
 assert.match(admin,/if\(driver\.documents_enabled\)\s*\$\('driver'\)\.append\(option\(driver\.id,driver\.name\)\)/);
 assert.match(edge,/documents_enabled:x\.user_id===pilotDriverId/);
 assert.match(edge,/\.eq\('slot','driver_a'\)\.eq\('role','driver'\)/);
 assert.match(edge,/\.gt\('expires_at',new Date\(\)\.toISOString\(\)\)/);
});

test('single-recipient pilot upload is enforced by the backend before Storage',()=>{
 assert.match(edge,/async function requireMilanoPasqualeRecipient\(db,required=true\)/);
 assert.match(edge,/\.eq\('slot','driver_a'\)\.eq\('role','driver'\)/);
 assert.match(edge,/normal\(identity\.first_name\)!=='milano'\|\|normal\(identity\.last_name\)!=='pasquale'/);
 const upload=edge.slice(edge.indexOf('async function upload('),edge.indexOf('async function publish('));
 const active=upload.indexOf('await activeDriver(db,String(form.get(');
 const only=upload.indexOf('if(driverId!==await requireMilanoPasqualeRecipient(db))');
 const storage=upload.indexOf('.storage.from(BUCKET)');
 assert.ok(active>=0&&only>active&&storage>only,'check ownership before writing PDF bytes');
 const publish=edge.slice(edge.indexOf('async function publish('),edge.indexOf('async function revokeDocument('));
 assert.match(publish,/if\(doc\.driver_id!==await requireMilanoPasqualeRecipient\(db\)\)/);
 assert.match(admin,/if\(driver\.documents_enabled\)/);
 assert.match(admin,/if\(!recipient\?\.documents_enabled\)/);
 assert.match(admin,/const issue=validateUploadFields\(values\)/);
 assert.match(read('amministratore/buste-paga/index.html'),/caricare e pubblicare PDF esclusivamente per MILANO PASQUALE/);
});
test('audit and immutable first-access evidence stay server-managed',()=>{
 assert.match(migration,/lts_payroll_write_audit/);
 assert.match(edge,/await db\.rpc\('lts_payroll_mark_first_access'/);
 assert.match(edge,/await db\.rpc\('lts_payroll_acknowledge'/);
 assert.match(edge,/lts_payroll_revoke/);
 assert.match(admin,/Messa a disposizione confermata il/);
 assert.match(admin,/primo accesso PDF il/);
 assert.match(documents,/await api\.acknowledge\(doc\.id\)/);
 assert.match(documents,/const file=await api\.download\(doc\.id\)/);
 assert.doesNotMatch(login,/service_role|SUPABASE_SECRET|sb_secret_/);
});

test('admin frontend never makes unauthenticated reads of staff or PDFs',()=>{
 assert.match(admin,/account\.verifySession\(\)/);
 assert.match(read('amministratore/admin.mjs'),/await account\.verifyAdminTotp\(code,selected\)/);
 assert.doesNotMatch(admin,/account\.verifyAdminTotp/);
 assert.match(admin,/if\(!account\.isVerified\(\)\|\|account\.getRole\(\)!=='admin'\)/);
 assert.match(admin,/^protect\(\);/m);
 assert.match(login,/id="upload-form"/);
 assert.match(login,/id="filter-driver"/);
 assert.match(login,/id="filter-category"/);
 assert.match(login,/id="documents"/);
});
