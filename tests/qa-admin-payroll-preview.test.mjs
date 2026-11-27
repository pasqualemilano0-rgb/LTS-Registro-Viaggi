import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const chooser=read('amministratore/index.html');
const preview=read('amministratore/buste-paga/anteprima/index.html');
const css=read('amministratore/buste-paga/anteprima/anteprima.css');
const guarded=read('amministratore/buste-paga/index.html');
const secure=read('documenti/admin-documents.mjs');
const api=read('supabase/functions/lts-payroll/index.ts');

test('admin chooser enters the protected workspace; static preview remains separate',()=>{
 assert.match(chooser,/id="select-area-amministrativa"[^>]+href="\.\/buste-paga\/"/);
 assert.match(chooser,/Cedolini, CU, pubblicazione PDF e archivio riservato/);
 assert.match(chooser,/Accesso amministratore e MFA già verificati/);
 assert.match(preview,/MODALITÀ ANTEPRIMA — senza credenziali/);
 assert.match(preview,/ANTEPRIMA NON OPERATIVA/);
 assert.match(preview,/class="button-primary active-link" href="\.\.\/"/);
});

test('preview is physically disconnected from the payroll API and contains no private data',()=>{
 assert.match(preview,/connect-src 'none'/);
 assert.match(preview,/script-src 'none'/);
 assert.match(preview,/form-action 'none'/);
 assert.match(preview,/noindex,nofollow,noarchive/);
 assert.doesNotMatch(preview,/<script\b|<iframe\b|<form\b/i);
 assert.doesNotMatch(preview,/https?:\/\/|data-user-id|access_token|Bearer |service_role|sb_secret_|auth\.getUser|supabase\.co/i);
 assert.doesNotMatch(css,/@import|url\(|https?:\/\/|javascript:/i);
 assert.match(preview,/<fieldset disabled class="form-preview"/);
 assert.match(preview,/<button type="button" class="button-primary" disabled>/);
 assert.match(preview,/<button type="button" disabled>Filtra per autista<\/button>/);
 assert.match(preview,/Non vengono letti documenti, nomi degli autisti o dati personali/);
 assert.match(preview,/Il caricamento, la pubblicazione e la revoca sono disabilitati/);
});

test('protected admin document flow and server checks remain untouched',()=>{
 assert.match(guarded,/id="login-form"/);
 assert.match(guarded,/id="mfa-form"/);
 assert.match(guarded,/id="workspace" hidden/);
 assert.match(secure,/^protect\(\);/m);
 assert.match(read('amministratore/admin.mjs'),/await account\.verifyAdminTotp\(code,selected\)/);
 assert.doesNotMatch(secure,/account\.verifyAdminTotp/);
 assert.match(api,/await checkLtsSession\(/);
 assert.match(api,/await requireAdminMfa\(/);
 assert.match(api,/PAYROLL_PILOT_LIST_ONLY=true/);
 assert.match(api,/if\(actor.role==='driver'&&\(PAYROLL_PILOT_LIST_ONLY\|\|!PAYROLL_ENABLED\)/);
 assert.match(api,/const PAYROLL_ADMIN_OPERATIONS_ENABLED=true/);
});

test('mobile preview uses local LTS visuals with responsive layout and no credentials',()=>{
 assert.match(preview,/href="\.\/anteprima\.css\?v=20261123-v1"/);
 assert.match(preview,/src="\.\.\/\.\.\/\.\.\/assets\/lts-logo\.png"/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 for(const area of ['Cedolini','CU','Altri documenti']){
  assert.ok(preview.includes(area),'missing preview category '+area);
 }
 assert.doesNotMatch(preview,/<input[^>]+type="password"/);
});
