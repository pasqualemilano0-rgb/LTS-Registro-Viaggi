import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const css=read('app.css'),adminCSS=read('amministratore/pro-theme.css');
const html=read('amministratore/index.html');

test('driver entrypoints load the original LTS theme and preserve account routes',()=>{
 for(const p of ['index.html','shell.html']){
  const source=read(p);
  assert.match(source,/app[.]css[?]v=20261104-login-harbor-v1/);
  assert.doesNotMatch(source,/href="[^"]*pro-theme[.]css/);
  assert.match(source,/app[.]mjs[?]v=20261104-login-harbor-v1/);
 }
 assert.match(css,/\.overview\{background:var\(--teal\);color:#fff/);
 assert.match(css,/\.section-hero\{[^}]*background:linear-gradient\(115deg,#005f77,#087d94\)/);
 assert.match(html,/pro-theme[.]css[?]v=20261104-console-v5/);
 assert.match(html,/admin-nav-brand/);
 assert.match(html,/id="management-tab"/);
 assert.match(html,/id="report-tab"/);
 assert.match(html,/id="login-panel"/);
 assert.match(html,/id="mfa-panel"/);
 assert.match(html,/id="pro-insights"/);
});

test('new PWA worker precaches the original stylesheet, not the unused override',()=>{
 const sw=read('sw.js');
 assert.match(sw,/const CACHE = PREFIX \+ '20261104-login-harbor-v1'/);
 assert.match(sw,/"\/LTS-Registro-Viaggi\/app[.]css"/);
 assert.doesNotMatch(sw,/"\/LTS-Registro-Viaggi\/pro-theme[.]css"/);
 assert.doesNotMatch(sw,/service_role|sb_secret_/i);
});

test('administrator retains independent professional layout',()=>{
 assert.match(adminCSS,/#dashboard>.admin-switch/);
 assert.match(adminCSS,/grid-template-columns:238px minmax\(0,1fr\)/);
 assert.match(adminCSS,/@media\(max-width:1029px\)/);
 assert.doesNotMatch(adminCSS,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|https?:\/\/|@import|javascript:/i);
 assert.doesNotMatch(adminCSS,/url\s*\(/i);
 assert.doesNotMatch(html,/onload\s*=|onclick\s*=/);
 assert.match(read('recupera-password.html'),/shared professional visual language/);
});

test('administrator sign-in V8 stays accessible and keeps protected flows intact',()=>{
 const login=read('amministratore/login-v8.css');
 assert.match(html,/login-v8[.]css[?]v=20261104-admin-login-v8/);
 for(const id of ['login-panel','login-form','login-phone','login-password','login-error',
                  'mfa-panel','mfa-verify-form','mfa-code','dashboard']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/auth-assurance/);
 assert.match(login,/body:has\(#dashboard\[hidden\]\)/);
 assert.match(login,/@media\(max-width:720px\)/);
 assert.match(login,/\(pointer:coarse\) and \(orientation:portrait\)/);
 assert.match(login,/min-height:56px/);
 assert.match(login,/font-size:16px/);
 assert.match(login,/max-width:1100px/);
 assert.doesNotMatch(login,/https?:\/\/|@import|url\s*\(|javascript:|service_role|sb_secret_/i);
 assert.doesNotMatch(html,/onload\s*=|onclick\s*=/);
});
