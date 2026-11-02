import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const cfg=read('runtime-config.mjs'),app=read('app.mjs'),store=read('client-store.mjs');
const auth=read('account-access.mjs'),sw=read('sw.js'),html=read('index.html'),shell=read('shell.html');
const base='/LTS-Registro-Viaggi/';
test('publishable account URLs only, no service key, no private register in git',()=>{
  assert.match(cfg,/"basePath": "\/LTS-Registro-Viaggi\/"/);
  assert.match(cfg,/"deviceToken": true/);
  assert.match(cfg,/"enabled": true/);
  assert.match(cfg,/https:\/\/otrqynkscpbeyuvdlgpg[.]supabase[.]co\/functions\/v1\/lts-phone-auth/);
  assert.match(cfg,/https:\/\/otrqynkscpbeyuvdlgpg[.]supabase[.]co\/functions\/v1\/lts-account-state/);
  assert.ok(cfg.includes('https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-driver-onboarding'));
  const exposed=[cfg,app,store,auth,sw,html,shell].join('\n');
  assert.doesNotMatch(exposed,/sb_secret_[A-Za-z0-9]+|SUPABASE_SERVICE_ROLE_KEY\s*[:=]|sk_live_[A-Za-z0-9]+/);
});
test('scope imports all modules from public Github Pages root',()=>{
  assert.match(app,/import \* as accountAccess from '\/LTS-Registro-Viaggi\/account-access[.]mjs'/);
  assert.match(store,/import \* as account from '\/LTS-Registro-Viaggi\/account-access[.]mjs'/);
  assert.match(auth,/import runtime from '\/LTS-Registro-Viaggi\/runtime-config[.]mjs'/);
  assert.match(store,/serviceWorker[.]register\('\/LTS-Registro-Viaggi\/sw[.]js', \{ scope: "\/LTS-Registro-Viaggi\/" \}/);
});
test('legacy device record remains isolated and is not silently merged',()=>{
  assert.match(store,/let accountOwner = null/);
  assert.match(store,/if \(!accountOwner\) meta[.]put\(value[.]user[.]id, 'active'\)/);
  assert.match(store,/localGet\(accountOwner\)/);
  assert.match(store,/if \(accountOwner && remote[.]user[.]id !== accountOwner\)/);
  assert.match(app,/accountAccess[.]accountGateRequired\(\)/);
  assert.match(app,/accountAccess[.]chooseDeviceArchive\(\)/);
  assert.match(app,/renderAccountGate\(/);
  assert.match(auth,/accountGateRequired\(\)\{return isEnabled\(\)&&\(hasSession\(\)\|\|locked\(\)\)/);
  assert.match(auth,/sessionStorage[.]setItem\(SESSION_KEY/);
  assert.doesNotMatch(auth,/localStorage[.]setItem\(SESSION_KEY/);
});
test('account archive ID must derive from verified session, not user input',()=>{
  assert.match(auth,/getAccountId\(\)\{return session\?'account:'\+session[.]user_id:null/);
  assert.match(auth,/result[?][.]user[?][.]id!==['"]account:['"]\+readStored\(\)[?][.]user_id/);
  assert.match(auth,/await verifySession\(\)/);
  assert.match(store,/account[.]archiveRequest\(method, body\)/);
});
test('offline worker activates new cache and precaches auth code without caching server data',()=>{
  assert.match(sw,/const CACHE = PREFIX \+ '20261102-drivers-v1'/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/account-access[.]mjs/);
  assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
  assert.match(sw,/if \(url[.]pathname[.]startsWith\(BASE \+ 'api\/'\)\) return/);
  assert.ok(existsSync(new URL('../account-access.mjs',import.meta.url)));
});
test('HTML entry points are identical and use the new cache buster',()=>{
  assert.equal(html,shell);
  assert.match(html,/app[.]css[?]v=20261102-drivers-v1/);
  assert.match(html,/app[.]mjs[?]v=20261102-drivers-v1/);
  assert.match(html,/<script type="module"/);
});
test('ports section stays integrated, untouched backups and no new bundled private backend',()=>{
  assert.match(app,/porti/);
  assert.ok(existsSync(new URL('../porti/index.html',import.meta.url)));
  assert.ok(existsSync(new URL('../porti/data/tfg_schedule.json',import.meta.url)));
  assert.ok(existsSync(new URL('../push-worker.js',import.meta.url)));
});

test('driver onboarding: admin-only controls, invite activation and guarded endpoints',()=>{
  assert.ok(app.includes('function showDriverAdmin('));
  assert.ok(app.includes('function showDriverActivation('));
  assert.ok(app.includes("accountAccess.getRole()==='admin'"));
  assert.ok(app.includes('activateDriverInvitation'));
  assert.ok(auth.includes('function manageDrivers('));
  assert.ok(auth.includes('function activateDriverInvitation('));
  assert.ok(auth.includes("if (!isVerified() || getRole() !== 'admin')"));
  assert.ok(auth.includes("credentials:'omit'"));
  assert.ok(auth.includes("cache:'no-store'"));
  assert.doesNotMatch(cfg,/sb_secret_|service_role/i);
  assert.ok(!auth.includes('localStorage.setItem(SESSION_KEY'));
});
