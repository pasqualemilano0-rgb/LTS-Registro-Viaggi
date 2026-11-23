import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('amministratore/index.html');
const entry=read('amministratore/admin.mjs');
const selector=read('amministratore/admin-area-choice.mjs');
const payrollHtml=read('amministratore/buste-paga/index.html');
const payroll=read('documenti/admin-documents.mjs');
const account=read('account-access.mjs');
const backend=read('supabase/functions/lts-payroll/index.ts');

test('one phone/password form and the MFA form precede the hidden area selector',()=>{
 assert.match(html,/id="admin-area-choice"[^>]*hidden/);
 assert.match(html,/id="admin-logistica-login"(?![^>]*hidden)/);
 assert.match(html,/id="login-form"/);
 assert.match(html,/id="mfa-panel"/);
 assert.match(html,/Accesso amministratore/);
 assert.match(html,/Accedi al Control Center/);
 assert.match(html,/id="admin-choice-logout"/);
 const selectorPos=html.indexOf('id="admin-area-choice"');
 const passwordPos=html.indexOf('id="login-password"');
 assert.ok(selectorPos<passwordPos,'hidden selector is part of the login page, never an authorization bypass');
 const lockdown=entry.slice(entry.indexOf('function lock('),entry.indexOf('function showDashboard('));
 assert.match(lockdown,/byId\('admin-area-choice'\)\.hidden=true/);
 assert.match(lockdown,/byId\('admin-logistica-login'\)\.hidden=false/);
});

test('authenticator verification and a valid admin role are necessary to show the chooser',()=>{
 const choice=entry.slice(entry.indexOf('function showAuthenticatedAreaChoice('),
  entry.indexOf('async function openAuthenticatedLogistics('));
 assert.match(choice,/!account\.isVerified\(\)\|\|account\.getRole\(\)!=='admin'/);
 assert.match(choice,/byId\('admin-logistica-login'\)\.hidden=true/);
 assert.match(choice,/byId\('admin-area-choice'\)\.hidden=false/);
 assert.match(choice,/dashboard\.hidden=true/);
 const authenticated=entry.slice(entry.indexOf('async function authenticate('),
  entry.indexOf('let driverRequest=',entry.indexOf('async function authenticate(')));
 assert.match(authenticated,/if\(status\.mfa_enrolled&&!status\.mfa_verified\)/);
 assert.match(authenticated,/showMfaPanel\(\)/);
 assert.match(authenticated,/if\(status\.mfa_enrolled&&status\.mfa_verified\)\{\s*showAuthenticatedAreaChoice\(\)/);
 assert.match(entry,/const verifiedMfa=await account\.verifyAdminTotp\(code,selected\)/);
 assert.match(entry,/await authenticate\(verifiedMfa\)/);
});

test('switching areas verifies the same server session and does not request credentials',()=>{
 const logistics=entry.slice(entry.indexOf('async function openAuthenticatedLogistics('),
  entry.indexOf('// Only accept a server-confirmed response',entry.indexOf('async function openAuthenticatedLogistics(')));
 assert.match(logistics,/const status=await account\.verifySession\(\)/);
 assert.match(logistics,/status\.role!=='admin'\|\|status\.mfa_verified!==true\|\|!account\.isVerified\(\)/);
 assert.match(logistics,/const previous=showDashboard\(status\)/);
 assert.doesNotMatch(logistics,/account\.login\(|verifyAdminTotp\(/);
 assert.match(entry,/window\.addEventListener\('lts-admin-open-logistics'/);
 assert.match(entry,/byId\('admin-return-areas'\)\.addEventListener\('click'/);
 assert.match(entry,/showAuthenticatedAreaChoice\(\)/);
 assert.match(html,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(html,/id="admin-return-areas"[^>]*hidden/);
 assert.doesNotMatch(selector,/sessionStorage|access_token|login-password|verifyAdminTotp/);
});

test('documents auto-use the same-tab account session and never have an active second login',()=>{
 assert.match(payrollHtml,/id="login-form"[^>]*hidden/);
 assert.match(payrollHtml,/Vai all’accesso unico LTS/);
 assert.match(payrollHtml,/Torna alle aree/);
 assert.match(payroll,/function restoreUnifiedAdminSession\(\)/);
 assert.match(payroll,/if\(!account\.hasSession\(\)\|\|account\.getRole\(\)!=='admin'\)/);
 assert.match(payroll,/void check\(\)/);
 assert.match(payroll,/const session=await account\.verifySession\(\)/);
 assert.match(payroll,/if\(!session\.mfa_enrolled\|\|!session\.mfa_verified\|\|!account\.isVerified\(\)\)/);
 assert.doesNotMatch(payroll,/account\.login\(|verifyAdminTotp\(/);
 assert.match(account,/sessionStorage\.getItem\(SESSION_KEY\)/);
 assert.match(account,/sessionStorage\.setItem\(SESSION_KEY,JSON\.stringify\(session\)\)/);
 assert.match(account,/export async function verifySession\(\)/);
});

test('logout and revoked sessions cannot open either private area',()=>{
 assert.match(entry,/byId\('admin-choice-logout'\)\.addEventListener\('click'/);
 assert.match(entry,/void account\.logout\(\)\.catch/);
 assert.match(entry,/lock\('Hai chiuso la sessione amministratore\.'/);
 assert.match(entry,/window\.addEventListener\('lts-account-locked',\(\)=>lock/);
 assert.match(backend,/await checkLtsSession\(/);
 assert.match(backend,/await requireAdminMfa\(/);
 assert.match(backend,/PAYROLL_PILOT_LIST_ONLY=true/);
 assert.match(backend,/if\(driverId!==await requireMilanoPasqualeRecipient\(db\)\)/);
});
