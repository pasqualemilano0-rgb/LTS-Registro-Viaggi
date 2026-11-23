import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const login=source('amministratore/index.html');
const payroll=source('amministratore/buste-paga/index.html');
const chooser=source('amministratore/admin-area-choice.mjs');
const style=source('amministratore/admin-area-choice.css');

test('administrator credentials precede area chooser',()=>{
 assert.match(login,/id="admin-area-choice"[^>]* hidden/);
 assert.match(login,/id="admin-logistica-login">/);
 assert.match(login,/id="login-form"/);
 assert.match(login,/id="mfa-panel"/);
 assert.match(login,/Accesso amministratore LTS/);
 assert.match(login,/src="\.\/admin-area-choice\.mjs\?v=20261123-unified-login-v1"/);
 assert.match(login,/id="select-area-logistica"/);
 assert.match(login,/id="select-area-amministrativa"/);
 assert.match(login,/id="admin-change-area"/);
 assert.match(chooser,/lts-admin-authenticated/);
 assert.match(chooser,/account\.isVerified\(\)/);
 assert.match(chooser,/account\.getRole\(\)!=='admin'/);
});

test('administrative area uses same authenticated session with a protected fallback',()=>{
 assert.match(login,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(payroll,/id="login-form"/);
 assert.match(payroll,/id="mfa-form"/);
 assert.match(payroll,/AREA AMMINISTRATIVA RISERVATA/);
 const script=source('documenti/admin-documents.mjs');
 assert.match(script,/if\(account\.hasSession\(\)\)\{\s*void check\(\)/);
 assert.match(script,/const session=await account\.verifySession\(\)/);
 assert.match(style,/#admin-area-choice\[hidden\],#admin-logistica-login\[hidden\]\{display:none!important\}/);
});

test('approved branding uses the exact original logo, Napoli porto and camion local assets',()=>{
 const raw=readFileSync(new URL('../assets/lts-logo.png',import.meta.url));
 const gitBlobSha=createHash('sha1').update(Buffer.from('blob '+raw.byteLength+'\0')).update(raw).digest('hex');
 assert.equal(gitBlobSha,'168228cfb22738ed74a3115fc47d361b635f9308',
   'Do not replace the user-supplied original LTS red/cyan logo.');
 assert.match(login,/src="\.\.\/assets\/lts-logo\.png"/);
 assert.match(login,/src="\.\.\/assets\/admin-hero-napoli\.svg"/);
 assert.match(login,/src="\.\.\/assets\/admin-card-logistica\.svg"/);
 assert.match(login,/src="\.\.\/assets\/admin-card-amministrativa\.(?:webp|svg)"/);
 const hero=source('assets/admin-hero-napoli.svg');
 assert.match(hero,/PORTO DI NAPOLI/);
 assert.match(hero,/Vesuvio|Napoli/);
 assert.match(hero,/truck|Camion|camion/);
 assert.match(style,/--lts-red:#ef082f/);
 assert.match(style,/--lts-cyan:#00a9e7/);
 assert.match(style,/--lts-navy:#062b59/);
 assert.match(style,/@media\(max-width:480px\)/);
});


test('visual selector never affects authenticated logistics dashboard or MFA',()=>{
 assert.match(style,/body:has\(#login-panel:not\(\[hidden\]\) #admin-area-choice:not\(\[hidden\]\)\) \.topbar/);
 assert.doesNotMatch(style,/body:has\(#admin-area-choice:not\(\[hidden\]\)\)/);
 assert.match(login,/id="dashboard" hidden/);
 assert.match(login,/id="mfa-panel"/);
 assert.match(style,/#admin-area-choice\[hidden\]/);
});
