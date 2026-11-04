import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const css=read('pro-theme.css'),adminCSS=read('amministratore/pro-theme.css');
const html=read('amministratore/index.html');
test('shared LTS visual design is loaded in both driver entrypoints and admin',()=>{
 for(const p of ['index.html','shell.html']){
  assert.match(read(p),/pro-theme[.]css[?]v=20261104-pro-ui-v4/);
 }
 assert.match(html,/pro-theme[.]css[?]v=20261104-pro-ui-v4/);
 assert.match(html,/admin-nav-brand/);
 assert.match(html,/id="management-tab"/);
 assert.match(html,/id="report-tab"/);
 assert.match(html,/id="login-panel"/);
 assert.match(html,/id="mfa-panel"/);
 assert.match(html,/id="pro-insights"/);
});
test('new shared stylesheet remains available offline without caching personal data',()=>{
 const worker=read('sw.js');
 assert.match(worker,/const CACHE = PREFIX \+ '20261104-lts-pro-ui-v4'/);
 assert.match(worker,/"\/LTS-Registro-Viaggi\/pro-theme\.css"/);
 assert.doesNotMatch(worker,/service_role|sb_secret_/i);
});
test('professional desktop sidebars with responsive mobile alternative',()=>{
 assert.match(css,/grid-template-columns:240px minmax\(0,1fr\)/);
 assert.match(css,/@media\(min-width:1080px\) and \(pointer:fine\)/);
 assert.match(css,/@media\(max-width:759px\)/);
 assert.match(adminCSS,/#dashboard>.admin-switch/);
 assert.match(adminCSS, /grid-template-columns:238px minmax\(0,1fr\)/);
 assert.match(adminCSS, /@media\(max-width:1029px\)/);
});
test('visual-only new code has no account, credential, or network operations',()=>{
 for(const s of [css,adminCSS]){
  assert.doesNotMatch(s,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|https?:\/\/|@import|javascript:/i);
  assert.doesNotMatch(s,/url\s*\(/i,'No external assets should load from the presentation layer');
 }
 assert.doesNotMatch(html,/onload\s*=|onclick\s*=/);
 assert.match(read('recupera-password.html'),/shared professional visual language/);
});
