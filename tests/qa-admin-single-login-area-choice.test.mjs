import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('amministratore/index.html');
const js=read('amministratore/admin-area-choice.mjs');
const admin=read('amministratore/admin.mjs');
const payroll=read('documenti/admin-documents.mjs');
const payrollHtml=read('amministratore/buste-paga/index.html');
test('login form precedes hidden area chooser',()=>{
 assert.match(html,/<div id="admin-area-choice"[^>]* hidden>/);
 assert.match(html,/<div id="admin-logistica-login">/);
 assert.match(html,/Accesso amministratore LTS/);
 assert.match(html,/Accedi al Control Center/);
 assert.match(js,/showLogin\(\);/);
});
test('chooser appears only after server-verified admin MFA',()=>{
 assert.match(admin,/document\.dispatchEvent\(new Event\('lts-admin-authenticated'\)\)/);
 assert.match(js,/account\.isVerified\(\)/);
 assert.match(js,/account\.getRole\(\)!=='admin'/);
 assert.match(js,/dashboard\.inert=true/);
 assert.match(js,/dashboard\.inert=false/);
});
test('area switch retains same session and navigation',()=>{
 assert.match(html,/id="admin-change-area"/);
 assert.match(js,/addEventListener\('click',showAreaChoice\)/);
 assert.match(html,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(js,/loginPanel\.hidden=true/);
 assert.doesNotMatch(js,/account\.login\(/);
 assert.doesNotMatch(js,/account\.signOut\(/);
});
test('payroll reuses server-verified session and MFA rather than trusting UI',()=>{
 assert.match(payroll,/if\(account\.hasSession\(\)\)\{\s*void check\(\)/);
 assert.match(payroll,/const session=await account\.verifySession\(\)/);
 assert.match(payroll,/session\.role!=='admin'/);
 assert.match(payroll,/!session\.mfa_verified\|\|!account\.isVerified\(\)/);
 assert.match(payroll,/await startWorkspace\(\)/);
 assert.match(payrollHtml,/id="login-form"/);
});
