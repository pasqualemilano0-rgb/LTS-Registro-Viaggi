import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('qa-sync.html'),js=read('qa-sync.mjs');
const css=read('qa-sync.css'),builder=read('scripts/build-qa-site.mjs');

test('QA server test page is distinct from production, nonindexed, and origin-restricted',()=>{
 assert.match(html,/LTS QA PRIVATA — SOLO DATI DI PROVA/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/connect-src 'self' https:\/\/sywxretbfgwxwhvdcknq[.]supabase[.]co/);
 assert.match(html,/script-src 'self'/);
 assert.doesNotMatch(html,/otrqynkscpbeyuvdlgpg|stead yzebra|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(js,/otrqynkscpbeyuvdlgpg|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
 assert.match(js,/sb_publishable_/);
 assert.match(html,/qa-sync[.]mjs/);
 assert.match(html,/qa-sync[.]css/);
 assert.match(builder,/\.mjs/);
 assert.match(css,/\.qa-banner/);
});
test('QA authentication never stores access tokens in localStorage or indexedDB',()=>{
 assert.match(js,/sessionStorage[.]setItem\(SESSION_KEY/);
 assert.match(js,/sessionStorage[.]removeItem\(SESSION_KEY/);
 assert.doesNotMatch(js,/localStorage[.]setItem|localStorage[.]getItem/);
 assert.match(js,/\/auth\/v1\/user/);
 assert.match(js,/\/auth\/v1\/token\?grant_type=password/);
});
test('QA revision check prevents a stale device overwriting another',()=>{
 assert.match(js,/&revision=eq[.]/);
 assert.match(js,/last_request_id===draft[.]requestId/);
 assert.match(js,/current[.]revision!==draft[.]baseRevision/);
 assert.match(js,/Conflitto di revisione/);
 assert.match(js,/return=representation/);
 assert.match(js,/crypto[.]randomUUID\(\)/);
});
test('QA offline outbox saves before remote transmission',()=>{
 assert.match(js,/indexedDB[.]open\(DB_NAME,1\)/);
 assert.match(js,/await localWrite\(session[.]user[.]id,nextDraft\)/);
 assert.match(js,/window[.]addEventListener\('online'/);
 assert.match(js,/La bozza locale è conservata/);
 assert.match(html,/Abbandona bozza locale/);
});
