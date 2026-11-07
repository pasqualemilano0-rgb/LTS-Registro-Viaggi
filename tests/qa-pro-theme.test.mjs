import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const css=read('app.css'),adminCSS=read('amministratore/pro-theme.css');
const html=read('amministratore/index.html');

test('driver entrypoints load the original LTS theme and preserve account routes',()=>{
 for(const p of ['index.html','shell.html']){
  const source=read(p);
  assert.match(source,/app[.]css[?]v=20261107-hide-online-saved-v1/);
  assert.doesNotMatch(source,/href="[^"]*pro-theme[.]css/);
  assert.match(source,/app[.]mjs[?]v=20261107-hide-online-saved-v1/);
  assert.match(source,/photo-splash[.]css[?]v=20261106-scania-photo-hd-v2/);
  assert.match(source,/assets\/lts-full-photo-hd[.]webp/);
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
 assert.match(sw,/const CACHE = PREFIX \+ '20261107-hide-online-saved-v1'/);
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
