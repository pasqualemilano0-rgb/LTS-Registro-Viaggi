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


test('SQL migration uses valid paired dollar delimiters and atomic audit triggers',()=>{
 const begins=(sql.match(/\bas \$\$/g)||[]).length;
 const ends=(sql.match(/\$\$;/g)||[]).length;
 assert.equal(begins,3,'audit and two restricted event RPC bodies');
 assert.equal(ends,3,'PL/pgSQL bodies must be closed');
 assert.match(sql,/after insert or update of state, first_accessed_at, acknowledged_at/);
 assert.match(sql,/values \(new\.id, new\.driver_id, 'first_access'\)/);
 assert.match(sql,/values \(new\.id, new\.driver_id, 'acknowledge'\)/);
 assert.match(sql,/revoke all on function public\.lts_payroll_mark_first_access\(uuid,uuid\) from public,anon,authenticated/);
 assert.match(sql,/revoke all on function public\.lts_payroll_acknowledge\(uuid,uuid\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.lts_payroll_acknowledge\(uuid,uuid\) to service_role/);
});

test('first document access is authenticated, owner-scoped, published-only and server timed',()=>{
 assert.match(api,/if\(actor\.role==='driver'\)\{\s*\/\/ Mark first PDF access/);
 assert.match(api,/await db\.rpc\('lts_payroll_mark_first_access'/);
 assert.match(api,/data\.category==='cedolino'&&!data\.acknowledged_at/);
 assert.match(sql,/category <> 'cedolino' or acknowledged_at is not null/);
 assert.match(api,/p_document_id:id,p_driver_id:actor\.userId/);
 assert.match(sql,/first_accessed_at=coalesce\(first_accessed_at,now\(\)\)/);
 assert.match(sql,/where id=p_document_id and driver_id=p_driver_id and state='published'/);
});

test('pre-PDF availability confirmation is required, restricted, and not proof of viewing or payment',()=>{
 assert.match(api,/async function acknowledge\(db,actor,id\)\{\s*if\(actor\.role!=='driver'\)fail\(403\)/);
 assert.match(api,/await db\.rpc\('lts_payroll_acknowledge'/);
 assert.match(sql,/acknowledged_at=coalesce\(acknowledged_at,now\(\)\)/);
 assert.match(sql,/category='cedolino'\s+and state='published'\s+returning acknowledged_at/);
 assert.match(driver,/api\.acknowledge\(doc\.id\)/);
 assert.match(driver,/La conferma NON attesta lettura, pagamento/);
 assert.match(driver,/await api\.acknowledge\(doc\.id\)[\s\S]*const file=await api\.download\(doc\.id\)/);
 assert.match(admin,/Messa a disposizione confermata il/);
 assert.match(text('documenti/index.html'),/non equivale a firma, pagamento dello stipendio/);
});

test('admin document workspace reuses the one verified Control Center MFA session',()=>{
 const payrollHtml=text('amministratore/buste-paga/index.html');
 const control=text('amministratore/admin.mjs');
 assert.match(payrollHtml,/id="login-form"[^>]*hidden/);
 assert.match(payrollHtml,/Vai all’accesso unico LTS/);
 assert.match(admin,/function restoreUnifiedAdminSession\(\)/);
 assert.match(admin,/^protect\(\);/m);
 assert.match(admin,/const session=await account\.verifySession\(\)/);
 assert.match(admin,/if\(!session\.mfa_enrolled\|\|!session\.mfa_verified\|\|!account\.isVerified\(\)\)/);
 assert.doesNotMatch(admin,/account\.login\(|account\.verifyAdminTotp\(/);
 assert.match(control,/await account\.verifyAdminTotp\(code,selected\)/);
});

test('profile reuses a server-approved driver check without fetching on every click',()=>{
 assert.match(profile,/if\(payrollProfileEligible\(\)\)\{/);
 assert.match(profile,/const accountOwner=accountAccess\.getAccountId\(\)/);
 assert.match(profile,/if\(payrollProfileCached\(accountOwner\)\)showAuthorizedDocuments\(true\)/);
 assert.match(profile,/void prefetchPayrollProfileAccess\(\)\.then\(showAuthorizedDocuments\)/);
 assert.match(profile,/!dialog\.open\|\|!payrollProfileEligible\(\)/);
 assert.match(profile,/accountAccess\.getAccountId\(\)!==accountOwner/);
 assert.match(profile,/if\(!authorized\)\{/);
 assert.match(profile,/current\?\.remove\(\)/);
 assert.match(profile,/menuButton\('I MIEI DOCUMENTI'/);
 assert.match(profile,/new URL\('documenti\/',import\.meta\.url\)/);
 assert.match(profile,/if\(current\)return/);
 assert.match(profile,/if\(existing\)existing\.prepend\(item\)/);
 assert.match(profile,/if\(first\)first\.before\(group\);else body\.append\(group\)/);
 assert.match(profile,/const showAuthorizedDocuments=authorized=>/);
 assert.match(profile,/if\(payrollProfileEligible\(\)\)/);
 assert.match(profile,/payrollProfileCached\(accountOwner\)/);
 assert.match(profile,/prefetchPayrollProfileAccess\(\)/);
 const prefetch=profile.slice(profile.indexOf('if(payrollProfileEligible()){'));
 assert.doesNotMatch(prefetch,/await api\.documents/,'profile opening must not wait for network');
 assert.doesNotMatch(profile,/Deno\.env|getAccountId\(\)===['"][a-f0-9-]{36}/);
 assert.match(text('runtime-config.mjs'),/"payrollEndpoint":/);
 const page=text('documenti/driver-documents.mjs');
 assert.match(page,/const status=await account\.verifySession\(\)/);
 assert.match(page,/function payrollConfigured\(\)/);
});
