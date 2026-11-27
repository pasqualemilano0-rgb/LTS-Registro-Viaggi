import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const entry=source('amministratore/index.html');
const admin=source('amministratore/admin.mjs');
const chooser=source('amministratore/admin-area-choice.mjs');
const payroll=source('amministratore/buste-paga/index.html');
const payrollClient=source('documenti/admin-documents.mjs');
const style=source('amministratore/admin-area-choice.css');

test('one administrator login is shown BEFORE Control Center, never alongside it',()=>{
 assert.match(entry,/id="admin-area-choice"[^>]*hidden/);
 assert.match(entry,/id="admin-logistica-login"(?![^>]*hidden)/);
 assert.match(entry,/id="login-form"/);
 assert.match(entry,/id="mfa-panel"/);
 assert.match(entry,/id="admin-area-title"/);
 assert.match(entry,/ACCESSO UNICO · CONTROL CENTER/);
 assert.match(entry,/Accesso amministratore/);
 assert.match(entry,/Dopo la verifica MFA potrai scegliere e utilizzare entrambe le aree/);
 assert.match(entry,/Accedi al Control Center/);
 assert.match(entry,/id="admin-area-back"[^>]*hidden/);
 assert.ok(entry.indexOf('id="admin-area-choice"')<entry.indexOf('id="login-form"'),
  'HTML ordering must not be used as authorization: the choice is hidden by default');
 assert.match(entry,/admin\.mjs\?v=20261127-unified-login-v1/);
 assert.match(entry,/admin-area-choice\.mjs\?v=20261127-unified-login-v1/);
 assert.match(entry,/admin-area-choice\.css\?v=20261127-unified-login-v1/);
});

test('verified MFA session reveals the chooser, with no second password prompt',()=>{
 assert.match(admin,/function showAuthenticatedAreaChoice\(\)/);
 assert.match(admin,/adminMfaGatePassed=false/);
 assert.match(admin,/adminMfaGatePassed=status\.mfa_enrolled===true&&status\.mfa_verified===true/);
 assert.match(admin,/if\(!adminMfaGatePassed\|\|!account\.isVerified\(\)\|\|account\.getRole\(\)!=='admin'\)return false/);
 assert.match(admin,/dashboard\.hidden=true;dashboard\.inert=false/);
 assert.match(admin,/loginPanel\.hidden=false/);
 assert.match(admin,/byId\('admin-logistica-login'\)\.hidden=true/);
 assert.match(admin,/byId\('admin-area-choice'\)\.hidden=false/);
 assert.match(admin,/if\(status\.mfa_enrolled&&status\.mfa_verified\)\{\s*adminMfaGatePassed=true;\s*showAuthenticatedAreaChoice\(\)/);
 assert.match(admin,/const status=statusFromCompletedVerification\|\|await account\.verifySession\(\)/);
 assert.match(admin,/const verifiedMfa=await account\.verifyAdminTotp\(code,selected\)/);
 assert.match(admin,/await authenticate\(verifiedMfa\)/);
 assert.match(admin,/byId\('admin-choice-logout'\)\.addEventListener\('click'/);
});

test('area selection only asks for a server recheck, not another credential',()=>{
 assert.match(entry,/id="select-area-logistica"[^>]*aria-controls="dashboard"/);
 assert.match(entry,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(entry,/id="admin-return-areas"/);
 assert.match(admin,/async function openAuthenticatedLogistics\(\)/);
 assert.match(admin,/const status=await account\.verifySession\(\)/);
 assert.match(admin,/status\.role!=='admin'\|\|status\.mfa_verified!==true\|\|!account\.isVerified\(\)/);
 assert.match(admin,/const previous=showDashboard\(status\)/);
 assert.match(admin,/byId\('admin-return-areas'\)\.addEventListener\('click'/);
 assert.doesNotMatch(chooser,/login-password|login-phone|verifyAdminTotp|sessionStorage|localStorage/);
 const events=[];
 const button={addEventListener:(name,cb)=>{if(name==='click')button.click=cb;}};
 runInNewContext(chooser,{
  document:{getElementById:id=>id==='select-area-logistica'?button:null},
  window:{dispatchEvent:event=>events.push(event.type)},
  Event:class{constructor(type){this.type=type;}}
 });
 button.click();
 assert.deepEqual(events,['lts-admin-open-logistics']);
});

test('documents verify the existing shared admin session, not a second login',()=>{
 assert.match(payroll,/id="login-form"[^>]*hidden/);
 assert.match(payroll,/Vai all’accesso unico LTS/);
 assert.match(payroll,/Torna alle aree/);
 assert.match(payroll,/admin-documents\.mjs\?v=20261123-unified-login-v1/);
 assert.match(payrollClient,/function restoreUnifiedAdminSession\(\)/);
 assert.match(payrollClient,/if\(!account\.hasSession\(\)\|\|account\.getRole\(\)!=='admin'\)/);
 assert.match(payrollClient,/void check\(\)/);
 assert.match(payrollClient,/const session=await account\.verifySession\(\)/);
 assert.match(payrollClient,/if\(!session\.mfa_enrolled\|\|!session\.mfa_verified\|\|!account\.isVerified\(\)\)/);
 assert.doesNotMatch(payrollClient,/\baccount\.login\(/);
 assert.doesNotMatch(payrollClient,/\baccount\.verifyAdminTotp\(/);
 assert.match(payrollClient,/window\.addEventListener\('pageshow',event=>\{/);
 assert.match(payroll,/href="\.\/anteprima\/"/);
});

test('server protection and original LTS branding are retained',()=>{
 const edge=source('supabase/functions/lts-payroll/index.ts');
 assert.match(edge,/await requireAdminMfa\(/);
 assert.match(edge,/await checkLtsSession\(/);
 assert.match(edge,/PAYROLL_PILOT_LIST_ONLY=true/);
 const raw=readFileSync(new URL('../assets/lts-logo.png',import.meta.url));
 const sha=createHash('sha1').update(Buffer.from('blob '+raw.byteLength+'\0')).update(raw).digest('hex');
 assert.equal(sha,'168228cfb22738ed74a3115fc47d361b635f9308');
 for(const asset of ['lts-logo.png','admin-hero-napoli.svg','admin-card-logistica.svg',
  'admin-card-amministrativa.webp'])assert.ok(entry.includes(asset));
 assert.match(style,/#admin-area-choice\[hidden\],#admin-logistica-login\[hidden\]\{display:none!important\}/);
 assert.match(style,/#admin-area-choice \.admin-area-session-bar/);
 assert.match(style,/@media\(max-width:480px\)/);
});
