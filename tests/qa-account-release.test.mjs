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
  assert.match(sw,/const CACHE = PREFIX \+ '20261106-clienti-autocomplete-v2'/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/account-access[.]mjs/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/shared\/quick-trip[.]mjs/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/shared\/port-source-status[.]mjs/);
  assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
  assert.match(sw,/if \(url[.]pathname[.]startsWith\(BASE \+ 'api\/'\)\) return/);
  assert.ok(existsSync(new URL('../account-access.mjs',import.meta.url)));
});
test('HTML entry points are identical and use the new cache buster',()=>{
  assert.equal(html,shell);
  assert.match(html,/app[.]css[?]v=20261106-clienti-autocomplete-v2/);
  assert.match(html,/app[.]mjs[?]v=20261106-clienti-autocomplete-v2/);
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

test('external file import cannot replace account data silently',()=>{
 const source=app;
 assert.ok(source.includes("unionStates(previous,imported,{prefer:null})"));
 assert.ok(source.includes("unionStates(D.validateState(state),imported,{prefer:null})"));
 assert.ok(source.includes('Scarica backup del registro attuale'));
 assert.ok(source.includes('Unisci i due registri'));
 assert.ok(source.includes("await accountAccess.verifySession()"));
 assert.ok(source.includes("JSON.stringify(D.validateState(state))!==originalFingerprint"));
 assert.ok(source.includes("acknowledge.checked&&backupStarted"));
 assert.doesNotMatch(source,/Sostituirà il registro attuale/);
 assert.doesNotMatch(source,/await persist\(imported\)/);
});

test('external backup merges old and new trips, clients and tariffs without changing source objects',async()=>{
  const {emptyState,upsertTariff,createTrip,exportBackup,importBackup}=await import('../shared/domain.mjs');
  const {unionStates,SyncConflictError}=await import('../shared/sync-merge.mjs');
  const named=()=>({...emptyState(),profile:{firstName:'MARIO',lastName:'ROSSI'}});
  const account=upsertTariff(named(),{id:'account-tariff',client:'AZIENDA A',city:'NAPOLI',cents:5000});
  const backup=upsertTariff(named(),{id:'backup-tariff',client:'AZIENDA B',city:'SALERNO',cents:6400});
  account.trips=[createTrip({id:'account-trip',date:'2026-10-17',client:'AZIENDA A',city:'NAPOLI',container:'BILICO'},account)];
  backup.trips=[createTrip({id:'backup-trip',date:'2026-10-18',client:'AZIENDA B',city:'SALERNO',container:'REEFER'},backup)];
  const originalAccount=JSON.stringify(account),originalBackup=JSON.stringify(backup);
  const imported=importBackup(exportBackup(backup));
  const merged=unionStates(account,imported,{prefer:null});
  assert.equal(merged.trips.length,2);
  assert.equal(merged.customers.length,2);
  assert.equal(merged.tariffs.length,2);
  assert.deepEqual(new Set(merged.trips.map(x=>x.id)),new Set(['account-trip','backup-trip']));
  assert.deepEqual(new Set(merged.tariffs.map(x=>x.cents)),new Set([5000,6400]));
  assert.equal(JSON.stringify(account),originalAccount);
  assert.equal(JSON.stringify(backup),originalBackup);
  const conflict=upsertTariff(named(),{id:'same-rate',client:'AZIENDA A',city:'NAPOLI',cents:9999});
  assert.throws(()=>unionStates(account,conflict,{prefer:null}),SyncConflictError);
  assert.equal(JSON.stringify(account),originalAccount);
});

test('denied account after refresh revokes all protected client actions',()=>{
 assert.ok(auth.includes('async function withSessionRetry(request, afterRefresh=null)'));
 assert.ok(auth.includes('if(error.status===403){revoke();throw error;}'));
 assert.ok(auth.includes('if([401,403].includes(error.status))revoke();'));
 assert.ok(auth.includes("()=>api('loginEndpoint',{action:'session'},readStored()?.access_token)"));
 assert.ok(auth.includes("()=>api('archiveEndpoint',payload,readStored()?.access_token)"));
 assert.ok(auth.includes('()=>verifySession());'));
 assert.ok(auth.includes("()=>api('onboardingEndpoint',payload,readStored()?.access_token)"));
 assert.doesNotMatch(auth,/return api\('onboardingEndpoint',payload,readStored\(\).access_token\)/);
});

test('LTS Porti fallback reads LTS public snapshots, not the old Booking repository',()=>{
 const port=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../porti/index.html',import.meta.url),'utf8');
 const provenance=JSON.parse(readFileSync(new URL('../porti/upstream.json',import.meta.url),'utf8'));
 const lts='https://raw.githubusercontent.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/main/porti/data/';
 assert.equal(port.split(lts).length-1,3);
 assert.ok(!port.includes('raw.githubusercontent.com/pasqualemilano0-rgb/container-booking-web-/'));
 assert.match(index,/porti-access[.]mjs[?]v=20261103-lts-gate-v1/);
 const files=new Map(provenance.files.map(item=>[item.path,item]));
 assert.equal(files.get('app.js').sha256,'e13b15529d8cee5ba3bc330c1748b49492beb799dae818a523fa63ade66d4095');
 assert.equal(files.get('index.html').sha256,'e214deb437467b2e43ed62f39dcfff8e40008bb8c10116dd092ec3927a058d98');
});

test('driver re-entry and credential recovery controls are available only through verified admin transport',()=>{
  assert.ok(app.includes("manageDrivers('remove-pending',{phone:entry.phone})"));
  assert.ok(app.includes("manageDrivers('issue-reset',{phone:entry.phone})"));
  assert.ok(app.includes("manageDrivers('revoke-reset',{phone:entry.phone})"));
  assert.ok(auth.includes("'remove-pending', 'remove-activated', 'reinsert-activated', 'issue-reset', 'revoke-reset'"));
  assert.match(app,/if\(\['pending','invited','processing','expired','revoked'\]\.includes\(entry\.status\)\)/);
});


test('driver reenrollment UI uses existing account reset, never deletes activated archives',()=>{
  assert.ok(app.includes("Reinserisci credenziali"));
  assert.ok(app.includes("manageDrivers('issue-reset'"));
  assert.ok(app.includes("manageDrivers('remove-pending'"));
  assert.ok(app.includes('Non creare un secondo account'));
});

test('activated drivers can be removed and reinserted without data deletion',()=>{
 assert.ok(app.includes("['active','disabled','resetting'].includes(entry.status)"));
 assert.ok(app.includes("manageDrivers('remove-activated',{phone:entry.phone})"));
 assert.ok(app.includes("manageDrivers('reinsert-activated',"));
 assert.ok(app.includes('Reinserisci account rimosso'));
 assert.ok(auth.includes("'remove-activated', 'reinsert-activated'"));
 assert.doesNotMatch(app,/accountAccess[.]manageDrivers\('delete-user'/);
});

test('dedicated admin console loads only verified administrative transport',async()=>{
 const adminHtml=readFileSync(new URL('../amministratore/index.html',import.meta.url),'utf8');
 const adminJs=readFileSync(new URL('../amministratore/admin.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../amministratore/admin.css',import.meta.url),'utf8');
 const model=await import('../amministratore/model.mjs');
 assert.match(adminHtml,/Content-Security-Policy/);
 assert.match(adminHtml,/src="\.\/admin[.]mjs\?v=20261105-admin-resume-v1"/);
 assert.match(adminJs,/import \* as account from '\.\.\/account-access[.]mjs\?v=20261104-company-v3'/);
 assert.match(adminJs,/await account[.]verifySession\(\)/);
 assert.match(adminJs,/account[.]getRole\(\)!=='admin'/);
 assert.ok(adminJs.includes("account.manageDrivers('list')"));
 assert.ok(adminJs.includes("'remove-activated'"));
 assert.ok(adminJs.includes("'reinsert-activated'"));
 assert.doesNotMatch(adminJs,/archiveRequest\(|deleteUser\(|innerHTML|localStorage|service_role/i);
 assert.ok(css.includes('@media(max-width:630px)'));
 assert.deepEqual(model.driverSummary([{status:'active'},{status:'disabled'}]),{total:2,active:1,blocked:1,pending:0});
 assert.ok(app.includes("new URL('amministratore/',import.meta.url).href"));
});

test('driver remembered login uses AES-GCM vault and online authorization on restart',()=>{
 const module=read('driver-session-vault.mjs');
 assert.match(auth,/import \{readDriverToken,writeDriverToken,clearDriverToken\} from '\/LTS-Registro-Viaggi\/driver-session-vault[.]mjs'/);
 assert.match(module,/crypto[.]subtle[.]encrypt/);
 assert.match(module,/crypto[.]subtle[.]decrypt/);
 assert.doesNotMatch(module,/localStorage|sessionStorage|access_token|password/);
 assert.match(auth,/restoreDriverSession/);
 assert.match(auth,/if\(restored\)await verifySession\(\)/);
 assert.match(app,/await accountAccess[.]restoreDriverSession\(\)/);
 assert.match(sw,/\/LTS-Registro-Viaggi\/driver-session-vault[.]mjs/);
 assert.match(sw,/BASE \+ 'driver-session-vault[.]mjs'/);
 assert.ok(existsSync(new URL('../driver-session-vault.mjs',import.meta.url)));
 assert.doesNotMatch(sw,/refresh_token|user_id[.]|password/);
});

test('the main register CSP is restrictive, loads before scripts, and preserves only required services',()=>{
 const policy=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
 assert.ok(policy,'Main LTS entrypoint must have CSP');
 assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<link rel="stylesheet"'));
 assert.equal(html,shell);
 const entries=new Map(policy.split(';').map(v=>v.trim().split(/\s+/))
   .filter(v=>v.length>1).map(([k,...v])=>[k,v]));
 for(const [key,required] of Object.entries({
   'default-src':["'none'"],'base-uri':["'none'"],'object-src':["'none'"],
   'script-src':["'self'"],'script-src-attr':["'none'"],
   'style-src-elem':["'self'"],'style-src-attr':["'unsafe-inline'"],
   'img-src':["'self'","data:","blob:"],
   'connect-src':["'self'","https://otrqynkscpbeyuvdlgpg.supabase.co",
     "https://lts-registro-viaggi-iphone.steadyzebra1.chatgpt.site"],
   'frame-src':["'self'"],'worker-src':["'self'"],
   'manifest-src':["'self'"],'form-action':["'self'"]
 })){
   assert.deepEqual(entries.get(key),required,'CSP entry not allowed for '+key);
 }
 assert.ok(!policy.includes("'unsafe-eval'"));
 assert.ok(!policy.includes("frame-ancestors"));
 assert.ok(!policy.includes("http:"));
 assert.ok(!policy.includes("https:;"));
 assert.match(html, /<meta name="referrer" content="no-referrer">/);
 assert.match(app,/porti/);
 const porti=read('porti/index.html');
 assert.match(porti,/https:\/\/api\.conateco\.it/);
 assert.match(porti,/https:\/\/container-booking-backend\.pasqualemilano0\.workers\.dev/);
 assert.match(sw,/const CACHE = PREFIX \+ '20261106-clienti-autocomplete-v2'/);
});

test('logout is authenticated on the server and remote driver disconnection is admin-only',()=>{
 const admin=read('amministratore/admin.mjs');
 assert.match(auth,/export async function logout\(\)/);
 assert.match(auth,/action:'logout'/);
 assert.match(auth,/result[?][.]revoked===true/);
 assert.match(app,/void accountAccess[.]logout\(\)/);
 assert.match(app,/document[.]addEventListener\('visibilitychange'/);
 assert.match(app,/await accountAccess[.]verifySession\(\)/);
 assert.match(auth,/'revoke-sessions'/);
 assert.match(admin,/Scollega tutti i dispositivi/);
 assert.match(admin,/account[.]manageDrivers\(action,data\)/);
 assert.match(admin,/account[.]logout\(\)/);
 assert.match(admin,/Sessioni revocate/);
 assert.match(sw,/const CACHE = PREFIX \+ '20261106-clienti-autocomplete-v2'/);
 assert.doesNotMatch([app,auth,admin,sw].join('\n'),/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+/);
});


test('public-facing UI and privacy have no assistant branding while disclosing real backend services',()=>{
 const privacy=read('privacy/index.html');
 const archived=read('effeerre/app.mjs');
 const readme=read('README.md');
 for(const [label,source] of [['LTS interface',app],['EFFE.ERRE interface',archived],
   ['privacy notice',privacy],['public README',readme]]){
   assert.doesNotMatch(source,/ChatGPT|Codex|OpenAI/i,label+' must not show development-assistant branding');
 }
 assert.match(app,/browser interno di un’altra app/);
 assert.match(archived,/browser interno di un’altra app/);
 assert.match(privacy,/backend HTTPS esterno/);
 assert.match(privacy,/Supabase/);
 assert.match(privacy,/GitHub Pages/);
 assert.match(read('effeerre/sw.js'),/public-content-20261103-v2/);
 assert.equal(read('effeerre/index.html'),read('effeerre/shell.html'));
 assert.match(read('effeerre/index.html'),/20261103-effeerre-cleanup-v2/);
});

test('TOTP admin flow uses verified backend session and never exposes secret in public code',()=>{
 const html=read('amministratore/index.html');
 const admin=read('amministratore/admin.mjs');
 const css=read('amministratore/admin.css');
 assert.match(html,/id="mfa-panel"/);
 assert.match(html,/id="mfa-warning"/);
 assert.match(html,/pattern="\[0-9\]\{6\}"/);
 assert.match(html,/img-src 'self' data:/);
 assert.match(html,/admin\.mjs\?v=20261105-admin-resume-v1/);
 assert.match(html,/admin\.css\?v=20261104-company-v3/);
 assert.match(admin,/account\.enrollAdminTotp/);
 assert.match(admin,/account\.verifyAdminTotp/);
 assert.match(auth,/export async function enrollAdminTotp\(\)/);
 assert.match(auth,/export async function verifyAdminTotp\(code,factorId=null\)/);
 assert.match(auth,/verified=!mfaEnrolled\|\|mfaVerified/);
 assert.match(app,/logged\.mfa_enrolled&&!logged\.mfa_verified/);
 assert.match(sw,/20261106-clienti-autocomplete-v2/);
 assert.match(css,/#mfa-setup-secret/);
 for(const item of [html,admin,auth,app]){
  assert.doesNotMatch(item,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+/);
 }
});

test('MFA enrollment requires the latest QR and a correctly synchronized device clock',()=>{
 const html=read('amministratore/index.html');
 assert.match(html,/Usa esclusivamente il QR o la chiave di questa configurazione/);
 assert.match(html,/Data e ora automatiche/);
 assert.match(html,/fuso orario automatico/);
 assert.match(html,/codice basato sull'ora/);
 assert.match(html,/admin[.]mjs[?]v=20261105-admin-resume-v1/);
});

test('Authenticator app switching preserves the existing enrollment instead of regenerating QR',()=>{
 const admin=read('amministratore/admin.mjs'),auth=read('account-access.mjs');
 const html=read('amministratore/index.html');
 assert.match(admin,/function resumeWhenSafe\(\)/);
 assert.match(admin,/if\(!byId\('mfa-panel'\)[.]hidden\)return;/);
 assert.match(admin,/document[.]addEventListener\('visibilitychange',resumeWhenSafe\)/);
 assert.match(admin,/window[.]addEventListener\('online',resumeWhenSafe\)/);
 assert.match(admin,/const pending=account[.]pendingAdminMfaInfo\(\)/);
 assert.match(admin,/showMfaPanel\(true,true,pending[.]purpose\)/);
 assert.match(admin,/account[.]forgetPendingAdminMfa\(\)/);
 assert.match(auth,/export function rememberPendingAdminMfa\(factorId,purpose='primary'\)/);
 assert.match(auth,/export function pendingAdminMfa\(\)/);
 assert.match(auth,/export function forgetPendingAdminMfa\(\)/);
 assert.match(auth,/MFA_PENDING_MAX_AGE=30\*60\*1000/);
 assert.match(html,/id="mfa-resume-help"/);
 assert.match(html,/senza conservare QR e chiave/);
 assert.doesNotMatch(admin,/sessionStorage|localStorage|innerHTML/);
 assert.doesNotMatch(auth,/sessionStorage[.]setItem\(MFA_PENDING_KEY,JSON[.]stringify\(\{[^\n]*(?:qr_code|secret|code)/);
 assert.match(sw,/20261106-clienti-autocomplete-v2/);
});

test('administrator has separately verified backup authenticator without bypassing AAL2',()=>{
 const admin=read('amministratore/admin.mjs'),html=read('amministratore/index.html');
 for(const id of ['mfa-backup-card','mfa-backup-status','mfa-backup-start',
   'mfa-factor-choice-wrap','mfa-factor-choice']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(admin,/account[.]enrollBackupAdminTotp\(\)/);
 assert.match(admin,/account[.]listAdminMfaFactors\(\)/);
 assert.match(admin,/mfaFactorId\|\|byId\('mfa-factor-choice'\)[.]value\|\|null/);
 assert.match(admin,/showMfaPanel\(true,true,pending[.]purpose\)/);
 assert.match(auth,/export async function enrollBackupAdminTotp\(\)/);
 assert.match(auth,/!isVerified\(\)/);
 assert.match(auth,/export async function listAdminMfaFactors\(\)/);
 assert.match(auth,/rememberPendingAdminMfa\(result[.]factor_id,'backup'\)/);
 assert.doesNotMatch(admin,/localStorage|sessionStorage|innerHTML|sb_secret_/i);
 assert.match(html,/Non caricare mai QR, chiavi TOTP/);
 assert.match(sw,/20261106-clienti-autocomplete-v2/);
});

test('Porti can start only after verified account handshake from the LTS parent',()=>{
 const gate=read('porti-access.mjs');
 const portal=read('porti/index.html');
 assert.match(app,/accountAccess\.isVerified\(\)/);
 assert.match(app,/event\.source!==portiFrame\.contentWindow/);
 assert.doesNotMatch(app,/porti-open-link',href:url/);
 assert.match(portal,/src="\.\.\/porti-access\.mjs/);
 assert.match(portal,/<body hidden>/);
 assert.doesNotMatch(portal,/<script type="module" src="app\.js/);
 assert.match(gate,/PARENT_PATHS\.has\(window\.parent\.location\.pathname\)/);
 assert.match(gate,/event\.source!==window\.parent/);
 assert.match(gate,/event\.origin!==location\.origin/);
 assert.match(gate,/event\.data\?\.type!=='lts-porti-authorized'/);
 assert.match(gate,/import\('\.\/porti\/app\.js/);
 assert.match(sw,/porti-access\.mjs/);
});


test('TFG Booking requires an LTS revalidated access token in the generated client',()=>{ 
 const porti=read('porti/app.js');
 assert.match(porti,/import \{getVerifiedAccessToken\} from '\.\.\/account-access[.]mjs'/);
 assert.match(porti,/await getVerifiedAccessToken\(\)/);
 assert.match(auth,/export async function getVerifiedAccessToken\(\)/);
 assert.match(porti,/lookupTfgBooking\(/);
});

test('stuck session allows only same-owner password reauthentication, never silent account switching',()=>{
 assert.match(auth,/const previous=readStored\(\);\s*const data=await api\('loginEndpoint',\{action:'login',phone,password\}\)/);
 assert.match(auth,/data[.]user_id!==previous[.]user_id\|\|data[.]role!==previous[.]role/);
 assert.match(auth,/await api\('loginEndpoint',\{action:'logout'\},data[.]access_token\)/);
 assert.match(auth,/const next=saveSession\(data\)/);
 assert.doesNotMatch(auth,/if\(readStored\(\)\)throw new Error\('Esci dall.account attuale/);
 assert.match(store,/accountOwner !== nextOwner && \(active\?\.pending \|\| blocked\)/);
});
test('login gate shows visible account recovery before password fields without losing offline archive',()=>{
 const gate=app.slice(app.indexOf('function renderAccountGate('),app.indexOf("window.addEventListener('lts-account-locked'"));
 assert.match(gate,/const hasPreviousSession=accountAccess[.]hasSession\(\)/);
 assert.match(gate,/const recovery=hasPreviousSession\?/);
 assert.match(gate,/recovery,\s*accountLoginFields\(\{fromGate:true\}\)/);
 assert.match(gate,/Esci e cambia account/);
 assert.match(gate,/store[.]lockRevokedAccount\(\)/);
 assert.doesNotMatch(gate,/indexedDB[.]deleteDatabase\(|localStorage[.]clear\(/);
 const style=read('app.css');
 assert.match(style,/account-session-recovery/);
 assert.match(style,/account-session-switch:focus-visible/);
});

test('online catalog sync never reconstructs a currently edited trip',()=>{
 const fn=app.slice(app.indexOf('async function refreshCompanyCustomers(){'),
    app.indexOf('function companyCustomersPanel(){'));
 assert.match(fn,/if\(tab==='customers'\)updateCompanyCustomersPanel\(\)/);
 assert.match(fn,/document[.]getElementById\('trip-customers'\)/);
 assert.match(fn,/form[.]querySelector\('#trip-cities'\)/);
 assert.match(fn,/form[.]querySelector\('#second-cities'\)/);
 assert.doesNotMatch(fn,/\brender\(\);/);
});
test('tariff customer autocomplete includes company names without sharing tariffs',()=>{
 const dialog=app.slice(app.indexOf('function tariffDialog('),app.indexOf('function openProfile('));
 assert.match(dialog,/datalist\('tariff-customers',\[\.\.\.state[.]customers[.]map\(c=>c[.]name\),\.\.\.companyCustomers[.]map\(c=>c[.]name\)\]\)/);
 assert.match(dialog,/D[.]upsertTariff\(state,/);
 assert.doesNotMatch(dialog,/saveSharedMapsCustomer\(/);
});

test('curated Maps operational hints show only as read-only site information',()=>{
 const client=read('shared-maps-client.mjs');
 assert.match(client,/operationalNotes:c[.]operationalNotes\|\|''/);
 assert.match(app,/class:'company-customer-operations'/);
 assert.match(app,/Indicazioni operative fornite da autista/);
 assert.doesNotMatch(app,/customer[.]note.*company-customer-operations/);
});

test('shared Google Maps customers have an independent search for company and location',()=>{
 const catalog=app.slice(app.indexOf('function updateCompanyCustomersPanel('),
   app.indexOf('function renderInsert('));
 assert.match(catalog,/filterSharedCustomers\(companyCustomers,companyCustomerSearch\)/);
 assert.match(catalog,/type:'search',id:'company-customer-search'/);
 assert.match(catalog,/Cerca nella lista clienti aziendale/);
 assert.match(catalog,/Nessuna sede corrisponde alla ricerca/);
 assert.match(catalog,/updateCompanyCustomersPanel\(panel\)/);
 assert.match(app,/Cerca nei clienti personali: nome, località o partita IVA/);
 assert.match(read('app.css'),/company-customer-search:focus-within/);
});

test('dashboard Maps action reuses secure client import and keeps unsaved trip draft',()=>{
 const insert=app.slice(app.indexOf('function renderInsert('),app.indexOf('function citySuggestions('));
 assert.match(insert,/if\(!editingId\)form[.]append\(el\('section',\{class:'dashboard-maps-shortcut'/);
 assert.match(insert,/Aggiungi da Google Maps/);
 assert.match(insert,/\(\)=>\{collect\(\);mapsCustomerDialog\(\);\}/);
 assert.equal((app.match(/function mapsCustomerDialog\(/g)||[]).length,1);
 assert.equal((app.match(/await saveSharedMapsCustomer\(/g)||[]).length,1);
 assert.match(app,/mapsLinkForCompanySync\(\{existingCustomer:customer,proposal,enabled:sharedMapsEnabled\(\)\}\)/);
 const css=read('app.css');
 assert.match(css,/dashboard-maps-shortcut-button:focus-visible/);
});
