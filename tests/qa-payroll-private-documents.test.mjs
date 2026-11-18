import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261118170000_lts_payroll_documents.sql');
const edge=read('supabase/functions/lts-payroll/index.ts');
const app=read('app.mjs'),sw=read('sw.js'),home=read('index.html');
const driver=read('payroll/driver.mjs'),admin=read('paghe-amministrazione/app.mjs');
const adminHtml=read('paghe-amministrazione/index.html');
const adminMain=read('amministratore/index.html');

test('payroll records are private to the Edge service role',()=>{
 assert.match(sql,/lts_payroll_documents[\s\S]*enable row level security/i);
 assert.match(sql,/lts_payroll_documents[\s\S]*force row level security/i);
 assert.match(sql,/revoke all on public[.]lts_payroll_documents from public,anon,authenticated;/);
 assert.match(sql,/revoke all on public[.]lts_payroll_audit from public,anon,authenticated;/);
 assert.match(sql,/lts-payroll-private','lts-payroll-private',false/);
 assert.match(sql,/array\['application\/pdf'\]/);
 assert.doesNotMatch(sql,/create policy/i);
 assert.match(sql,/grant execute on function public[.]lts_payroll_transition[\s\S]*to service_role/);
});
test('all operations verify Auth identity, live session, role and admin MFA',()=>{
 assert.match(edge,/auth[.]getUser\(jwt\)/);
 assert.match(edge,/lts_account_access/);
 assert.match(edge,/account[.]enabled !== true/);
 assert.match(edge,/lts_session_is_active/);
 assert.match(edge,/lts_admin_verified_totp_factor/);
 assert.match(edge,/!UUID[.]test\(factor \|\| ""\) \|\| !aal2\(jwt\)/);
 assert.match(edge,/if \(user[.]role !== "admin"\) throw \{ status: 403 \}/);
 assert.match(edge,/origin && origin !== ORIGIN/);
 assert.doesNotMatch(edge,/createSignedUrl|makePublic|publicUrl/);
});
test('driver data is scoped to the signed-in employee and only published documents',()=>{
 assert.match(edge,/if \(user[.]role === "driver"\) query = query[.]eq\("employee_id", user[.]id\)[.]eq\("status", "published"\)/);
 assert.match(edge,/if \(user[.]role === "driver"\) await validDriver\(db, user[.]id\)/);
 assert.match(edge,/if \(!data[.]object_path[.]startsWith\(data[.]employee_id \+ "\/"\)\)/);
 assert.match(edge,/lts_payroll_transition/);
 assert.match(sql,/insert into public[.]lts_payroll_audit\(document_id,actor_id,action\)/);
});
test('upload is limited and always creates private drafts',()=>{
 assert.match(edge,/const MAX_PDF = 8 \* 1024 \* 1024/);
 assert.match(edge,/file[.]type !== "application\/pdf"/);
 assert.match(edge,/!== "%PDF-"/);
 assert.match(edge,/upsert: false/);
 assert.match(sql,/status text not null default 'draft'/);
 assert.match(admin,/Bozza caricata[.] Verifica prima di pubblicare[.]/);
 assert.match(admin,/window[.]confirm/);
 assert.match(admin,/chooseDriver\(\)/);
 assert.doesNotMatch(admin,/chooseDriver\(byId\("driver-filter"\)[.]value\)/);
});
test('separate admin login and three driver document categories are connected to LTS',()=>{
 assert.match(adminHtml,/id="login-form"/);
 assert.match(adminHtml,/id="mfa-form"/);
 assert.match(admin,/account[.]verifyAdminTotp/);
 assert.match(admin,/!status[.]mfa_enrolled \|\| !status[.]mfa_verified/);
 assert.match(app,/menuButton\('I MIEI DOCUMENTI'/);
 assert.match(app,/accountAccess[.]getRole\(\)==='driver'/);
 assert.match(driver,/"CEDOLINO"/);
 assert.match(driver,/"CU"/);
 assert.match(driver,/"ALTRI DOCUMENTI"/);
 assert.match(driver,/getVerifiedAccessToken/);
 assert.match(driver,/cache: "no-store"/);
 assert.match(driver,/setInterval[\s\S]*60000/);
 assert.match(sw,/payroll\/driver[.]mjs/);
 assert.match(home,/frame-src 'self' blob:/);
 assert.match(adminMain,/href="[.][.]\/paghe-amministrazione\/"/);
 for(const client of [app,driver,admin,adminHtml,sw])
  assert.doesNotMatch(client,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9]+/);
});
