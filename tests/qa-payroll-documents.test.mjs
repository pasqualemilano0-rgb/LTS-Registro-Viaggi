/**
 * Static safety gates only. These DO NOT substitute for QA integration tests
 * against real JWTs, Supabase Storage, and two isolated driver accounts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=text('supabase/migrations/20261118_private_payroll_documents.sql');
const api=text('supabase/functions/lts-payroll/index.ts');
const driver=text('documenti/driver-documents.mjs');
const admin=text('documenti/admin-documents.mjs');
const transport=text('documenti/document-api.mjs');
const profile=text('app.mjs');
const adminIndex=text('amministratore/index.html');

test('DB defaults to draft; private bucket and no public table grants',()=>{
 assert.match(sql,/state text not null default 'draft'/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.lts_payroll_documents from anon, authenticated/);
 assert.match(sql,/lts-payroll-private','lts-payroll-private',false/);
 assert.doesNotMatch(sql,/create policy .* to (anon|authenticated)/i);
});

test('every Edge operation validates JWT and live session; admin MFA enforced',()=>{
 assert.match(api,/auth\.getUser\(match\[1\]\)/);
 assert.match(api,/await checkLtsSession\(/);
 assert.match(api,/await requireAdminMfa\(/);
 assert.match(api,/if\(!mfa\?\.enrolled\|\|!mfa\?\.verified\)/);
 assert.match(api,/mustAdmin\(actor\)/);
 assert.match(api,/\.eq\('driver_id',actor\.userId\)\.eq\('state','published'\)/);
 assert.match(api,/data\.driver_id!==actor\.userId\|\|data\.state!=='published'/);
 assert.match(api,/MAX_FILE=8388608/);
 assert.match(api,/Content-Disposition':'attachment/);
});

test('server publishes deliberately, never at upload',()=>{
 assert.match(api,/state:'draft'/);
 assert.match(api,/if\(input\.action==='publish'\)/);
 assert.match(api,/\.eq\('id',id\)\.eq\('state','draft'\)/);
 assert.match(admin,/window\.confirm\('Pubblicare/);
 assert.match(admin,/Caricare .*PDF come BOZZE/);
});

test('separate login page and LTS link exist without secrets',()=>{
 assert.match(text('amministratore/buste-paga/index.html'),/id="login-form"/);
 assert.match(text('amministratore/buste-paga/index.html'),/id="mfa-form"/);
 assert.match(adminIndex,/href="\.\/buste-paga\/"/);
 assert.match(profile,/I MIEI DOCUMENTI/);
 assert.match(driver,/category='cedolino'/);
 for(const file of [transport,admin,driver]){
  assert.doesNotMatch(file,/service_role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 }
 assert.match(transport,/cache:'no-store'/);
});
