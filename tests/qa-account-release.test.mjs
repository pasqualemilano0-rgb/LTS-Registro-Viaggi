import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const cfg=read('runtime-config.mjs'),app=read('app.mjs'),store=read('client-store.mjs');
const auth=read('account-access.mjs'),sw=read('sw.js'),html=read('index.html'),shell=read('shell.html');
const recovery=read('recupera-password.mjs'), recoveryHtml=read('recupera-password.html');
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
  assert.doesNotMatch(app,/accountAccess[.]chooseDeviceArchive\(\)/);
  assert.match(app,/renderAccountGate\(/);
  assert.match(auth,/accountGateRequired\(\)\{return true;/);
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
  assert.match(sw,/const CACHE = PREFIX \+ '20261102-account-required-v6'/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/account-access[.]mjs/);
  assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
  assert.match(sw,/if \(url[.]pathname[.]startsWith\(BASE \+ 'api\/'\)\) return/);
  assert.ok(existsSync(new URL('../account-access.mjs',import.meta.url)));
});
test('HTML entry points are identical and use the new cache buster',()=>{
  assert.equal(html,shell);
  assert.match(html,/app[.]css[?]v=20261102-account-required-v6/);
  assert.match(html,/app[.]mjs[?]v=20261102-account-required-v6/);
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
  assert.ok(app.includes("if(required&&store.usingAccount())body.append(button('Recupera vecchi viaggi'"));
  assert.ok(app.includes("dialog.close();showAccountLogin();"));
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

test('network-first account modules show latest UI while keeping offline fallback', async()=>{
  const swSource=read('sw.js');
  assert.match(swSource,/const NETWORK_FIRST_CODE = new Set/);
  const origin='https://pasqualemilano0-rgb.github.io';
  const appPath='/LTS-Registro-Viaggi/app.mjs';
  const events=new Map(),assets=new Map();
  const calls=[];
  let online=true;
  assets.set(appPath,new Response('OLD_APP_JS'));
  const cache={
    put:async(path,response)=>assets.set(path,response.clone()),
    match:async request=>assets.get(new URL(request.url||request,origin).pathname)?.clone()
  };
  const self={
    location:{origin},
    registration:{scope:origin+'/LTS-Registro-Viaggi/'},
    addEventListener:(name,listener)=>events.set(name,listener)
  };
  runInNewContext(swSource,{
    self,URL,Response,
    caches:{
      open:async()=>cache,
      match:async request=>cache.match(request),
      keys:async()=>[]
    },
    fetch:async(request,options)=>{
      calls.push({request,options});
      if(!online)throw new Error('offline');
      return new Response('NEW_APP_JS');
    }
  });
  const readPath=async path=>{
    let responded;
    events.get('fetch')({
      request:{url:origin+path,method:'GET',mode:'cors'},
      respondWith:pending=>{responded=pending;}
    });
    assert.ok(responded,'service worker must handle the application script');
    return (await responded).text();
  };
  assert.equal(await readPath(appPath),'NEW_APP_JS');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.cache,'reload');
  online=false;
  assert.equal(await readPath(appPath),'NEW_APP_JS');
  assert.equal(calls.length,2);
});

test('Gmail password recovery is linked, safe and never copies account data',()=>{
  assert.ok(app.includes('Imposta o recupera password via Gmail'));
  assert.ok(app.includes('/LTS-Registro-Viaggi/recupera-password.html'));
  assert.ok(recovery.includes("SUPABASE+'/auth/v1/'"));
  assert.ok(recovery.includes('recover?redirect_to='));
  assert.ok(recovery.includes("hash.get('type')!=='recovery'"));
  assert.ok(recovery.includes("history.replaceState(null,'',window.location.pathname)"));
  assert.ok(recovery.includes("requestApi('user',{method:'PUT',body:{password:pass},token:recoveryToken})"));
  assert.ok(recovery.includes("credentials:'omit'"));
  assert.ok(recovery.includes("compromisedPassword(pass)"));
  assert.ok(recovery.includes("https://api.pwnedpasswords.com/range/"));
  assert.ok(recovery.includes("slice(0,5)"));
  assert.ok(recovery.includes("!validPassword(pass)"));
  assert.ok(recoveryHtml.includes('Content-Security-Policy'));
  assert.ok(recoveryHtml.includes('no-referrer'));
  assert.ok(recoveryHtml.includes('type="password"'));
  assert.doesNotMatch(recovery,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|localStorage[.]setItem|sessionStorage[.]setItem/);
  assert.doesNotMatch(recoveryHtml,/<script[^>]+src="https:/i);
});

test('pending driver can be invited directly from the admin roster',()=>{
  assert.ok(app.includes("['pending','expired','revoked'].includes(entry.status)"));
  assert.ok(app.includes("entry.status==='pending'?'Genera invito':'Rigenera invito'"));
  assert.ok(app.includes("first.value=entry.firstName||''"));
  assert.ok(app.includes("last.value=entry.lastName||''"));
  assert.ok(app.includes("phone.value=entry.phone||''"));
  assert.ok(app.includes('if(submit.disabled)return;'));
  assert.ok(app.includes('form.requestSubmit();'));
  assert.ok(app.includes("accountAccess.manageDrivers('issue'"));
  assert.ok(app.includes("result.scrollIntoView({behavior:'smooth',block:'center'})"));
  assert.ok(app.includes("['active','disabled'].includes(entry.status)"));
  assert.ok(app.includes("['invited','processing'].includes(entry.status)"));
});

test('credentials are mandatory and pre-registration data stays recoverable',()=>{
 assert.match(auth,/accountGateRequired\(\)\{return true;/);
 assert.ok(auth.includes("chooseDeviceArchive(){throw new Error("));
 assert.ok(app.includes('accountLoginFields({fromGate:true})'));
 assert.doesNotMatch(app,/Usa l’archivio di questo dispositivo/);
 assert.ok(store.includes("if (!account.isEnabled() || !accountOwner || !account.isVerified())"));
 assert.ok(store.includes("await account.verifySession(); // fail closed"));
 assert.ok(store.includes("const record = await localGet(); // original device pointer"));
 assert.ok(store.includes("return exportBackup(legacy.state);"));
 assert.ok(store.includes("const result = await saveState(combined);"));
 assert.ok(store.includes("emptyTarget?'local':null"));
 assert.ok(app.includes('Scarica backup dei dati precedenti'));
 assert.ok(app.includes('Unisci nel mio account'));
 assert.ok(app.includes("restore.disabled=true"));
 assert.ok(app.includes("showLegacyArchiveRecovery(previous)"));
 assert.ok(app.includes('Recupera archivio precedente'));
 assert.ok(app.includes("result.pending?'Dati recuperati sul telefono."));
 assert.doesNotMatch(store,/meta[.]delete\('active'\)/);
});
