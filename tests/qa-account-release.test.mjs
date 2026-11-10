import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {emptyState,upsertCustomer,validateState} from '../shared/domain.mjs';
import {parseCustomerCsv,mergeCustomerCsv,exportCustomerCsv} from '../shared/customer-csv.mjs';
import {filterCustomerDirectory} from '../shared/maps-company-routing.mjs';
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
test('routine online-save label is hidden without disabling sync or warning messages',()=>{
 const app=read('app.mjs');
 const css=read('app.css');
 const html=read('index.html');
 for(const source of [app]){
  assert.match(source,/syncSavedOnline=!syncWarning/);
  assert.match(source,/status[?][.]status==='synced'/);
  assert.match(source,/dati salvati online/);
  assert.match(source,/hidden:syncSavedOnline/);
  assert.match(source,/syncWarning=\/offline\|error\|errore/);
 }
 assert.match(app,/class:'sync-banner-wrap',hidden:syncSavedOnline/);
 assert.match(app,/wrap[.]hidden=syncSavedOnline/);
 assert.match(css,/[.]sync-status\[hidden\]/);
 assert.match(css,/[.]sync-banner-wrap\[hidden\]/);
 assert.match(html,/app[.]mjs[?]v=20\d{6}-[a-z0-9-]+-v\d+/);
 // The backend reconciliation and online-saving mechanisms remain untouched.
 const storage=read('client-store.mjs');
 assert.match(storage,/Dati salvati online/);
});

test('installed PWA refreshes current data and update assets without dropping unsaved trips',()=>{
 const main=read('client-store.mjs');
 const mainApp=read('app.mjs');
 const worker=read('sw.js');
 for(const source of [main]){
  assert.match(source,/setInterval\(refreshSoon, 6000\)/);
  assert.match(source,/addEventListener\('focus', refreshSoon\)/);
  assert.match(source,/addEventListener\('pageshow', refreshSoon\)/);
  assert.match(source,/if \(!active \|\| blocked \|\| refreshing \|\| document[.]hidden/);
 }
 for(const source of [mainApp]){
  assert.match(source,/controllerchange/);
  assert.match(source,/registration[.]update\(\)/);
  assert.match(source,/safeAppUpdateReload\(\)/);
  assert.match(source,/store[.]getSyncInfo[?][.]\(\)[.]pending/);
  assert.match(source,/tab==='insert'/);
  assert.match(source,/document[.]querySelector\('dialog\[open\]'\)/);
 }
 for(const source of [worker]){
  assert.match(source,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
  assert.match(source,/NETWORK_FIRST_CODE/);
  assert.match(source,/app[.]mjs'/);
  assert.match(source,/app[.]css'/);
  assert.match(source,/cache: 'reload'/);
  assert.match(source,/url[.]origin !== self[.]location[.]origin/);
 }
 assert.equal(read('index.html'),read('shell.html'));
 assert.match(mainApp,/\},8000\);/);
 const admin=read('amministratore/admin.mjs');
 assert.match(admin,/\},10000\);/);
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
  assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/account-access[.]mjs/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/shared\/quick-trip[.]mjs/);
  assert.match(sw,/\/LTS-Registro-Viaggi\/shared\/port-source-status[.]mjs/);
   assert.match(sw,/BASE \+ 'shared\/maps-company-routing[.]mjs'/);
  assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
  assert.match(sw,/if \(url[.]pathname[.]startsWith\(BASE \+ 'api\/'\)\) return/);
  assert.ok(existsSync(new URL('../account-access.mjs',import.meta.url)));
});
test('HTML entry points are identical and use the new cache buster',()=>{
  assert.equal(html,shell);
  assert.match(html,/app[.]css[?]v=20261110-driver-resume-v1/);
  assert.match(html,/app[.]mjs[?]v=20\d{6}-[a-z0-9-]+-v\d+/);
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

test('administrator Gmail recovery remains separate from driver recovery',()=>{
  assert.doesNotMatch(app,/Imposta o recupera password via Gmail/);
  assert.doesNotMatch(app,/href:'\/LTS-Registro-Viaggi\/recupera-password[.]html'/);
  assert.match(read('amministratore/index.html'),/recupera-password[.]html/);
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


test('driver password recovery uses the administrator-issued one-time code, never email or SMS',()=>{
 const admin=read('amministratore/admin.mjs');
 const css=read('app.css');
 assert.match(app,/function showDriverPasswordRecovery\(/);
 assert.match(app,/accountAccess[.]recoverDriverPassword\(/);
 assert.match(app,/Recupera password autista/);
 assert.match(app,/Codice di ripristino/);
 assert.match(app,/non arriva automaticamente via SMS/);
 assert.match(app,/newPass!==confirm[.]value/);
 assert.match(app,/Password aggiornata/);
 assert.match(app,/account-driver-recovery-success/);
 assert.match(auth,/export async function recoverDriverPassword\(/);
 assert.match(auth,/activateDriverInvitation\(\{phone,code,password\}\)/);
 assert.match(auth,/if\(hasSession\(\)\)throw new Error/);
 assert.match(app,/password:newPass/);
 assert.doesNotMatch(app,/recupera-password[.]html/);
 assert.match(admin,/LTS → Recupera password/);
 assert.match(admin,/issue-reset/);
 assert.match(css,/account-driver-recovery-form/);
 assert.doesNotMatch(app,/recoveryToken|sb_secret_|SMS inviato/i);
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
 assert.ok(source.includes("unionStates(D.validateState(state),imported,{prefer:null,choices})"));
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
 assert.match(index,/porti-access[.]mjs[?]v=20261110-porti-freshcode-v2/);
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
  assert.ok(app.includes('Il registro esistente resta collegato.'));
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
 assert.match(adminHtml,/src="\.\/admin[.]mjs\?v=20261110-seamless-resume-v3"/);
 assert.match(adminJs,/import \* as account from '\.\.\/account-access[.]mjs\?v=20261107-realtime-v1'/);
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
      "wss://otrqynkscpbeyuvdlgpg.supabase.co",
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
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
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
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
 assert.doesNotMatch([app,auth,admin,sw].join('\n'),/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+/);
});


test('public-facing UI and privacy have no assistant branding while disclosing real backend services',()=>{
 const privacy=read('privacy/index.html');
 const readme=read('README.md');
 for(const [label,source] of [['LTS interface',app],
   ['privacy notice',privacy],['public README',readme]]){
   assert.doesNotMatch(source,/ChatGPT|Codex|OpenAI/i,label+' must not show development-assistant branding');
 }
 assert.match(app,/browser interno di un’altra app/);
 assert.match(privacy,/backend HTTPS esterno/);
 assert.match(privacy,/Supabase/);
 assert.match(privacy,/GitHub Pages/);
});

test('TOTP admin flow uses verified backend session and never exposes secret in public code',()=>{
 const html=read('amministratore/index.html');
 const admin=read('amministratore/admin.mjs');
 const css=read('amministratore/admin.css');
 assert.match(html,/id="mfa-panel"/);
 assert.match(html,/id="mfa-warning"/);
 assert.match(html,/pattern="\[0-9\]\{6\}"/);
 assert.match(html,/img-src 'self' data:/);
 assert.match(html,/admin\.mjs\?v=20261110-seamless-resume-v3/);
 assert.match(html,/admin\.css\?v=20261109-alpha-v1/);
 assert.match(admin,/account\.enrollAdminTotp/);
 assert.match(admin,/account\.verifyAdminTotp/);
 assert.match(auth,/export async function enrollAdminTotp\(\)/);
 assert.match(auth,/export async function verifyAdminTotp\(code,factorId=null\)/);
 assert.match(auth,/verified=!mfaEnrolled\|\|mfaVerified/);
 assert.match(app,/logged\.mfa_enrolled&&!logged\.mfa_verified/);
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
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
 assert.match(html,/admin[.]mjs[?]v=20261110-seamless-resume-v3/);
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
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
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
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
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
 assert.match(fn,/if\(changed&&tab==='customers'\)updateCompanyCustomersPanel\(\)/);
 assert.match(fn,/document[.]getElementById\('trip-customers'\)/);
 assert.match(fn,/form[.]querySelector\('#trip-cities'\)/);
 assert.match(fn,/form[.]querySelector\('#second-cities'\)/);
 assert.doesNotMatch(fn,/\brender\(\);/);
});
test('drivers use Maps customer suggestions but cannot set individual transfer fares',()=>{
 assert.match(app,/combinedTripCustomerChoices\(\{personal:state[.]customers,trips:state[.]trips,shared:companyCustomers\}\)/);
 assert.match(app,/companyFareSnapshot\(companyRates,companyRatesLoaded/);
 assert.match(app,/Le trasferte sono uguali per tutti gli autisti/);
 assert.doesNotMatch(app,/function tariffDialog\(/);
 assert.doesNotMatch(app,/D[.]upsertTariff\(state,/);
 assert.match(app,/mapsLinkForCompanySync/);
});

test('Maps operational hints remain available but stay hidden from compact client cards',()=>{
 const client=read('shared-maps-client.mjs');
 assert.match(client,/operationalNotes:c[.]operationalNotes\|\|''/);
 const card=app.slice(app.indexOf('function customerCard('),app.indexOf('function renderCustomers('));
 assert.doesNotMatch(card,/company-customer-operations|operationalNotes/);
 assert.doesNotMatch(card,/Indicazioni operative fornite da autista/);
 assert.match(app,/class:'directory-card-address'/);
 assert.match(app,/class:'directory-card-city'/);
});
test('clients have one live company and personal search with clear source filters',()=>{
 const catalog=app.slice(app.indexOf('function updateCompanyCustomersPanel('),
  app.indexOf('function renderInsert('));
 assert.match(catalog,/dedupedCustomerDirectory\(companyCustomers,state[.]customers\)/);
 assert.match(catalog,/filterSharedCustomers\(directory[.]shared,companyCustomerSearch\)/);
 assert.match(catalog,/customerDirectoryScope==='personal'\?state[.]customers:directory[.]personal/);
 assert.match(catalog,/type:'search',id:'company-customer-search'/);
 assert.match(catalog,/Cerca clienti per nome, città, indirizzo o telefono/);
 assert.match(catalog,/customerDirectoryScope/);
 assert.match(catalog,/customer-directory-results/);
 assert.match(catalog,/customerDirectoryLimit\+=24/);
 assert.match(catalog,/updateCompanyCustomersPanel\(panel\)/);
 assert.match(catalog,/Nessun cliente corrisponde alla ricerca/);
 assert.match(app,/function useCustomerInTrip\(customer\)/);
 assert.match(app,/function customerCard\(customer,\{shared=false\}/);
 assert.match(app,/Usa nel viaggio/);
 assert.match(app,/Apri Maps/);
 assert.match(app,/Nuovo cliente/);
 assert.doesNotMatch(app,/Cerca nei clienti personali: nome, località o partita IVA/);
 assert.match(read('app.css'),/customer-scope-button[.]selected/);
 assert.match(read('app.css'),/company-customer-search:focus-within/);
});

test('customer live search finds the right customer and ignores placeholder wording',()=>{
 const shared=[
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'SAN GIOVANNI A TEDUCCIO',
   address:'INDIRIZZO STRADALE DA CONFERMARE - SAN GIOVANNI A TEDUCCIO'},
  {name:'DE MATTEIS AGROALIMENTARE S.P.A.',city:'FLUMERI',
   address:'A.S.I. VALLE UFITA 83040 FLUMERI AV'},
  {name:'RUMMO SPA',city:'BENEVENTO',address:'VIA DEI GRANDI MAESTRI PASTAI 1'}
 ];
 const personal=[
  {name:'TRASPORTI VERDI',city:'NAPOLI',address:'VIALE AMENDOLA',
   vat:'12345678901',phone:'+39 081 1234567'}
 ];
 assert.deepEqual(filterCustomerDirectory(shared,'acetificio').map(x=>x.name),
  ['ACETIFICIO ANDREA MILANO SRL']);
 assert.deepEqual(filterCustomerDirectory(shared,'Giovanni TEDUCCIO').map(x=>x.name),
  ['ACETIFICIO ANDREA MILANO SRL']);
 assert.deepEqual(filterCustomerDirectory(shared,'valle 83040').map(x=>x.name),
  ['DE MATTEIS AGROALIMENTARE S.P.A.']);
 assert.deepEqual(filterCustomerDirectory(shared,'rummo').map(x=>x.name),['RUMMO SPA']);
 assert.equal(filterCustomerDirectory(shared,'CONFERMARE').length,0);
 assert.equal(filterCustomerDirectory(shared,'cliente inesistente').length,0);
 assert.deepEqual(filterCustomerDirectory(personal,'081 123').map(x=>x.name),['TRASPORTI VERDI']);
 assert.deepEqual(filterCustomerDirectory(personal,'12345678901').map(x=>x.name),['TRASPORTI VERDI']);
 assert.deepEqual(filterCustomerDirectory(shared,'').map(x=>x.name),shared.map(x=>x.name));
 assert.equal(shared[0].address,'INDIRIZZO STRADALE DA CONFERMARE - SAN GIOVANNI A TEDUCCIO');
});
test('customer typing works with mobile input and search/clear, without reconstructing screen',()=>{
 const catalog=app.slice(app.indexOf('function updateCompanyCustomersPanel('),
  app.indexOf('function renderInsert('));
 assert.match(catalog,/on:\{input:searchResults,search:searchResults,change:searchResults,compositionend:searchResults\}/);
 assert.match(catalog,/on:\{click:\(\)=>\{\s*input[.]value='';companyCustomerSearch=''/);
 assert.match(catalog,/customerDirectoryScope='all'/);
 assert.match(catalog,/if\(!companyCustomerSearch[.]trim\(\)&&next[.]trim\(\)\)/);
 assert.match(catalog,/input[.]focus\(\)/);
 assert.doesNotMatch(catalog,/\brender\(\);/);
 assert.match(app,/if\(next==='customers'&&tab!=='customers'\)\{companyCustomerSearch=''/);
});

test('customer cards show only essential location, street and saved phone',()=>{
 const card=app.slice(app.indexOf('function customerCard('),app.indexOf('function renderCustomers('));
 assert.match(card,/directory-card-city/);
 assert.match(card,/directory-card-address/);
 assert.match(card,/directory-card-phone/);
 assert.match(card,/tel:'\+dial/);
 assert.match(card,/if\(shared&&customer[.]mapsUrl\)/);
 assert.match(card,/Usa nel viaggio/);
 assert.match(card,/Apri Maps/);
 assert.doesNotMatch(card,/directory-card-fare/);
 assert.doesNotMatch(card,/operationalNotes/);
 assert.doesNotMatch(card,/customerTariffs/);
 assert.doesNotMatch(card,/customer[.]vat/);
 assert.match(app,/const phone=field\('Telefono','phone'/);
 assert.match(app,/phone:phone[.]input[.]value/);
 const css=read('app.css');
 assert.match(css,/Essential customer information: compact mobile address book/);
 assert.match(css,/-webkit-line-clamp:2/);
});

test('optional personal phone survives state validation, and CSV keeps legacy imports',()=>{
 const base=emptyState();
 const saved=upsertCustomer(base,{id:'customer-1',name:'Cliente prova',city:'Napoli',
  address:'Via Porto 1',vat:'',phone:'+39 081 1234567'});
 assert.equal(saved.customers[0].phone,'+39 081 1234567');
 assert.equal(validateState(saved).customers[0].phone,'+39 081 1234567');
 const csv=exportCustomerCsv(saved);
 assert.match(csv,/TELEFONO/);
 const phoneRows=parseCustomerCsv(csv);
 assert.equal(phoneRows[0].phone,'+39 081 1234567');
 const merged=mergeCustomerCsv(saved,phoneRows);
 assert.equal(merged.state.customers[0].phone,'+39 081 1234567');
 const legacy=parseCustomerCsv('CLIENTE;PARTITA IVA;CITTÀ;INDIRIZZO\nCLIENTE PROVA;;NAPOLI;VIA PORTO 1\n');
 assert.equal(legacy[0].phone,'');
 assert.equal(mergeCustomerCsv(saved,legacy).state.customers[0].phone,'+39 081 1234567');
});
test('saving a checked Maps link never adds another personal customer before shared deduplication',()=>{
 const dialog=app.slice(app.indexOf('function customerDialog('),app.indexOf('function openProfile('));
 const sharedSave=dialog.indexOf('await saveSharedMapsCustomer(mapsLink,candidate)');
 const personalSave=dialog.indexOf('D.upsertCustomer(state,{id:customer?.id,...candidate})');
 assert.ok(sharedSave>=0&&personalSave>sharedSave);
 assert.match(dialog,/if\(mapsLink\)\{/);
 assert.match(dialog,/dialog[.]close\(\);render\(\);[\s\S]*?return;/);
 assert.match(dialog,/matchingSharedCustomer\(companyCustomers,candidate\)/);
 assert.match(dialog,/await sharedMapsCustomers\(\)/);
 assert.match(dialog,/Non occorre inserirlo di nuovo/);
 const client=read('shared-maps-client.mjs');
 assert.match(client,/updated:result[.]updated===true/);
 assert.doesNotMatch(dialog,/saveSharedMapsCustomer\([\s\S]*?mapsLink\)/);
});
test('Google short-link regression diagnostics are available without credentials',()=>{
 const script=read('tests/maps-redirect-diagnostic.mjs');
 assert.match(script,/rC9kQ6YrYGj9gjsU9/);
 assert.match(script,/checkedGoogleMapsUrl\(canonical\)/);
 assert.match(script,/mergeMapsProposal\(verified[.]href\)/);
 assert.doesNotMatch(script,/Authorization|Bearer|token/);
});
test('Google Maps links use the authenticated allowlisted reader, not the legacy redirect-blocking API',()=>{
 const reader=read('maps-reader-client.mjs');
 const runtime=read('runtime-config.mjs');
 assert.match(runtime,/"mapsReaderEndpoint": "https:\/\/otrqynkscpbeyuvdlgpg[.]supabase[.]co\/functions\/v1\/lts-maps-reader"/);
 assert.match(reader,/account[.]getVerifiedAccessToken\(\)/);
 assert.match(reader,/checkedGoogleMapsUrl\(link\)/);
 assert.match(reader,/redirect:'error'/);
 assert.match(reader,/credentials:'omit'/);
 assert.match(reader,/if\(error[?][.]name==='AbortError'\)throw error/);
 assert.match(reader,/Collegamento al lettore Google Maps non riuscito/);
 assert.match(reader,/source[.]href/);
 const dialog=app.slice(app.indexOf('function mapsCustomerDialog('),
  app.indexOf('async function importCustomersCsv(',app.indexOf('function mapsCustomerDialog(')));
 assert.match(dialog,/await readMapsCustomer\(link,\{signal:controller[.]signal\}\)/);
 assert.match(dialog,/customerDialog\(null,proposal\)/);
 assert.doesNotMatch(dialog,/\/api\/maps-client/);
 assert.match(dialog,/Il cliente inserito senza verifica del link rimane personale/);
 assert.match(sw,/maps-reader-client[.]mjs/);
 const live=read('tests/qa-maps-reader-live.test.mjs');
 assert.match(live,/method:'OPTIONS'/);
 assert.match(live,/preflight[.]status,204/);
 assert.match(live,/denied[.]status,401/);
});
test('dashboard Maps action reuses secure client import and keeps unsaved trip draft',()=>{
 const insert=app.slice(app.indexOf('function renderInsert('),app.indexOf('function citySuggestions('));
 assert.match(insert,/if\(!editingId\)form[.]append\(el\('section',\{class:'dashboard-maps-shortcut'/);
 assert.match(insert,/Aggiungi da Google Maps/);
 assert.match(insert,/\(\)=>\{collect\(\);keepEditorScratchpad\(\);mapsCustomerDialog\(\);\}/);
 assert.equal((app.match(/function mapsCustomerDialog\(/g)||[]).length,1);
 assert.equal((app.match(/await saveSharedMapsCustomer\(/g)||[]).length,1);
 assert.match(app,/mapsLinkForCompanySync\(\{existingCustomer:customer,proposal,enabled:sharedMapsEnabled\(\)\}\)/);
 const css=read('app.css');
 assert.match(css,/dashboard-maps-shortcut-button:focus-visible/);
});

test('premium login install banner is visible before authentication and reuses native PWA install',()=>{
 const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../app.css',import.meta.url),'utf8');
 const login=source.slice(source.indexOf('function accountInstallBanner('),source.indexOf("window.addEventListener('lts-account-locked'"));
 assert.match(login,/accountInstallBanner\(\)/);
 assert.match(login,/data-install-trigger':true/);
 assert.match(login,/hidden:isInstalled\(\)/);
 assert.match(login,/button\('Installa app','secondary',startInstall/);
 assert.match(login,/account-install-banner-wave/);
 assert.match(styles,/account-install-banner-main/);
 assert.match(styles,/@keyframes lts-install-wave/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(login,/localStorage|sessionStorage|fetch\(|persist\(/);
});

test('same driver credential recovery is explained and exposed passwords remain rejected',()=>{
 const script=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const section=script.slice(script.indexOf('function showDriverActivation('),script.indexOf('function showDriverAdmin('));
 assert.match(section,/Attiva o ripristina il tuo account/);
 assert.match(section,/Non serve creare un altro account/);
 assert.match(section,/I tuoi viaggi restano collegati/);
 assert.match(section,/Il codice non è stato utilizzato e i viaggi sono conservati/);
 assert.match(section,/showActivationOpening\(\)/);
 assert.match(section,/accountAccess[.]login\(signInPhone,currentPassword\)/);
 assert.match(section,/tab='register'/);
 assert.match(section,/feedback[.]manualAccess\(\)/);
 assert.match(section,/Torna all.accesso/);
 assert.doesNotMatch(section,/createUser\(|disable.*breach/);
});

test('embedded access cannot display register or admin credential inputs',()=>{
 const admin=read('amministratore/admin.mjs');
 assert.match(app,/function denyEmbeddedRegister\(\)/);
 assert.match(app,/if\(!denyEmbeddedRegister\(\)\)initialize\(\)/);
 assert.match(app,/window[.]top===window[.]self/);
 assert.match(app,/root[.]replaceChildren/);
 assert.match(admin,/function denyEmbeddedAdmin\(\)/);
 assert.match(admin,/field[.]value='';field[.]disabled=true/);
 assert.match(admin,/if\(!denyEmbeddedAdmin\(\)\)\{/);
 assert.match(admin,/void authenticate\(\)/);
 assert.match(html,/visual-theme[.]css[?]v=20\d{6}-[a-z0-9-]+-v\d+/);
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
 assert.doesNotMatch(app,/frame-ancestors.*<meta/i);
});

test('complete LTS Scania photo stays still while only the progress bar moves',()=>{
 const photoCss=read('photo-splash.css'),fallbackCss=read('truck-loader.css');
 for(const page of ['index.html','shell.html']){
  const doc=read(page);
  assert.match(doc,/class="boot boot-photo-intro"/);
  assert.match(doc,/class="photo-splash"/);
  assert.match(doc,/class="photo-loading-bar"/);
  assert.match(doc,/width="941" height="1672"/);
  assert.match(doc,/assets\/lts-full-photo-hd[.]webp/);
  assert.match(doc,/photo-splash[.]css[?]v=20261106-scania-photo-hd-v2/);
  assert.match(doc,/aria-label="Caricamento LTS in corso"/);
  assert.doesNotMatch(doc,/class="truck-loader-vehicle"/);
 }
 assert.match(photoCss,/object-fit:contain/);
 assert.match(photoCss,/aspect-ratio:941\/1672/);
 assert.match(photoCss,/@keyframes lts-photo-bar-sweep/);
 assert.match(photoCss,/animation:lts-photo-bar-sweep 1[.]65s ease-in-out infinite/);
 assert.match(photoCss,/@keyframes lts-photo-bar-lanes/);
 assert.doesNotMatch(photoCss,/truck.*animation|truck.*transform/i);
 assert.doesNotMatch(fallbackCss,/@keyframes lts-truck-approach/);
 assert.doesNotMatch(fallbackCss,/@keyframes lts-truck-arrive/);
 assert.match(photoCss,/prefers-reduced-motion:reduce/);
 assert.match(sw,/assets\/lts-full-photo-hd[.]webp/);
 assert.match(sw,/photo-splash[.]css/);
 const image=readFileSync(new URL('../assets/lts-full-photo-hd.webp',import.meta.url));
 assert.ok(image.length>180000 && image.length<550000, 'the HD photo must retain crisp details while staying mobile-friendly');
 assert.equal(image.toString('ascii',0,4),'RIFF');
 assert.equal(image.toString('ascii',8,12),'WEBP');
});
test('Scania photo waits 2.5 seconds before showing login or personal register',async()=>{
 const start=app.indexOf('const MIN_INITIAL_SPLASH_MS=2500;');
 const end=app.indexOf('\nfunction renderSavedSessionConnectionGate(',start);
 assert.ok(start>=0&&end>start,'boot duration logic must be present');
 const code=app.slice(start,end)+'\nreturn {finishInitialTruckLoading,renderFirstBootGate};';
 const trial=async({now=0,connected=true,withLoader=true}={})=>{
  const timers=[],shown=[],loader={isConnected:connected};
  const root={querySelector:()=>withLoader?loader:null};
  const renderAccountGate=message=>shown.push(message||'login');
  const clock={value:0}; // The splash timer starts when the module executes.
  const {finishInitialTruckLoading,renderFirstBootGate}=new Function(
   'root','performance','setTimeout','renderAccountGate',code)(
   root,{now:()=>clock.value},(resolve,ms)=>{timers.push(ms);resolve();},renderAccountGate);
  clock.value=now; // Simulate elapsed time before authentication finishes.
  const first=await finishInitialTruckLoading();
  const second=await finishInitialTruckLoading();
  await renderFirstBootGate('Accesso autisti');
  return {first,second,timers,shown};
 };
 assert.deepEqual(await trial(),{first:true,second:true,timers:[2500],shown:['Accesso autisti']});
 assert.deepEqual(await trial({now:6900}),{first:true,second:true,timers:[],shown:['Accesso autisti']});
 assert.deepEqual(await trial({connected:false}),{first:false,second:false,timers:[2500],shown:[]});
 assert.deepEqual(await trial({withLoader:false}),{first:true,second:true,timers:[],shown:['Accesso autisti']});
 assert.match(app,/if\(transientDriverSessionError\(error\)\)\{\s*await renderFirstBootConnectionGate/);
 assert.match(app,/if\(!accountAccess[.]hasSession\(\)\)\{\s*await renderFirstBootGate\(\);return;/);
 assert.match(app,/if\(!\(await finishInitialTruckLoading\(\)\)\)return;\s*render\(\)/);
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
});

test('activation confirmation is visible and personal register requires verified login',()=>{
 const source=read('app.mjs');
 const activation=source.slice(source.indexOf('function showDriverActivation('),source.indexOf('function showDriverAdmin('));
 const overlay=source.slice(source.indexOf('function showActivationOpening('),source.indexOf('function showDriverActivation('));
 const register=source.slice(source.indexOf('function renderRegister('),source.indexOf('function searchBox('));
 assert.match(activation,/await accountAccess[.]activateDriverInvitation\(/);
 assert.match(activation,/const logged=await accountAccess[.]login\(/);
 assert.match(activation,/logged[.]role!=='driver'/);
 assert.match(activation,/accountAccess[.]isVerified\(\)/);
 assert.match(activation,/await initialize\(\)/);
 assert.match(activation,/store[.]usingAccount\(\)/);
 assert.match(activation,/feedback[.]manualAccess\(\)/);
 assert.match(overlay,/Account attivato!/);
 assert.match(overlay,/Non è stato possibile aprire automaticamente il registro/);
 assert.match(register,/activation-register-welcome/);
 assert.match(register,/role:'status'/);
 assert.match(source,/if\(!activationFirstOpen && store[.]usingAccount\(\)/);
 assert.match(source,/if\(!activationFirstOpen&&\(!state[.]profile[.]firstName/);
 assert.doesNotMatch(activation,/localStorage|sessionStorage|console[.]log/);
 const css=read('activation-feedback.css');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/activation-register-welcome/);
 for(const name of ['index.html','shell.html'])
   assert.match(read(name),/activation-feedback[.]css[?]v=20261106-onboarding-v1/);
 assert.match(read('sw.js'),/activation-feedback[.]css/);
});

test('photo splash is paired with immutable offline image and safe accessible loading state',()=>{
 const photo=read('photo-splash.css');
 for(const p of ['index.html','shell.html']){
  const doc=read(p);
  assert.match(doc,/class="photo-splash-art"/);
  assert.match(doc,/src="\/LTS-Registro-Viaggi\/assets\/lts-full-photo-hd[.]webp"/);
  assert.match(doc,/role="status" aria-label="Caricamento LTS in corso"/);
  assert.match(doc,/fetchpriority="high"/);
  assert.match(doc,/class="photo-loading-bar" aria-hidden="true"/);
 }
 assert.match(photo,/top:72[.]2%/);
 assert.match(photo,/left:7[.]5%/);
 assert.match(photo,/background:linear-gradient/);
 assert.match(photo,/prefers-reduced-motion:reduce/);
 assert.match(app,/root[.]querySelector\('\.photo-splash'\)/);
 assert.doesNotMatch(photo,/url\(["']?https?:/);
});


test('approved high-resolution login art leaves native secure account entry usable',()=>{
 const page=read('index.html'),shell=read('shell.html'),app=read('app.mjs');
 const css=read('login-premium.css'),sw=read('sw.js');
 for(const html of [page,shell]){
  assert.match(html,/login-premium[.]css[?]v=20261106-login-hd-v1/);
  assert.match(html,/href="\/LTS-Registro-Viaggi\/assets\/lts-login-hero-hd[.]webp" as="image"/);
 }
 assert.match(app,/class:'boot account-gate account-gate-premium'/);
 assert.match(app,/accountLoginFields\(\{fromGate:true\}\)/);
 assert.match(css,/assets\/lts-login-hero-hd[.]webp/);
 assert.match(css,/aspect-ratio:941\s*\/\s*580/);
 assert.match(css,/account-login-form-gate/);
 assert.match(css,/account-login-form [.]account-submit/);
 assert.match(css,/account-password-toggle/);
 assert.doesNotMatch(css,/https?:\/\/|@import|javascript:|position:fixed/i);
 const photo=readFileSync(new URL('../assets/lts-login-hero-hd.webp',import.meta.url));
 assert.ok(photo.length>100000&&photo.length<500000,'HD login art should be crisp yet mobile-friendly');
 assert.equal(photo.toString('ascii',0,4),'RIFF');
 assert.equal(photo.toString('ascii',8,12),'WEBP');
 assert.match(sw,/assets\/lts-login-hero-hd[.]webp/);
 assert.match(sw,/login-premium[.]css/);
});


test('Porti keeps the booking and vessel programs, without the two removed notices',()=>{
 const portal=read('porti/index.html'),ui=read('porti/driver-ui.mjs');
 const appCss=read('app.css'),gate=read('porti-access.mjs'),sw=read('sw.js');
 assert.match(app,/function renderPorti\(main\)/);
 assert.match(app,/porti\/index[.]html[?]v=20261110-porti-freshcode-v2/);
 assert.doesNotMatch(app,/Stato dei programmi navi|porti-source-overview|describePortSource/);
 assert.doesNotMatch(appCss,/\.porti-source-overview/);
 assert.doesNotMatch(portal,/Consulta solo a veicolo fermo|class="driver-notice"/);
 assert.match(portal,/Dove devi consegnare[?]/);
 assert.match(portal,/napoli-booking-details/);
 assert.match(portal,/data-booking-target="cnt"/);
 assert.match(portal,/data-booking-target="tfg"/);
 assert.match(portal,/sct-vessel-list/);
 assert.match(portal,/driver-ui[.]css[?]v=20261106-porti-original-v1/);
 assert.match(gate,/driver-ui[.]mjs[?]v=20261031-v44/);
 assert.match(gate,/lts-porti-authorized/);
 assert.match(ui,/syncNapoliTerminalPanels/);
 assert.doesNotMatch(ui,/setupPortiHomepage/);
 assert.doesNotMatch(app,/porti-hero-reference-image|lts-porti-hero-hd[.]webp/);
 assert.doesNotMatch(portal,/approved-screen[.]css/);
 for(const brand of ['conateco.png','tfg-portal.png','sct-compact.png'])
  assert.ok(existsSync(new URL('../porti/assets/terminal-logos/'+brand,import.meta.url)));
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
});

test('Smart Console V2 keeps context inside its authorized drawer and never writes data on preview',()=>{
 const html=read('amministratore/index.html');
 const ui=read('amministratore/smart-console.mjs');
 const css=read('amministratore/smart-console.css');
 assert.match(html,/id="smart-detail"/);
 assert.match(html,/id="smart-detail-body"/);
 assert.match(html,/id="smart-detail-actions"/);
 assert.match(html,/smart-console[.]css[?]v=20261108-smart-v2/);
 assert.match(ui,/function showDetail\(spec,item\)/);
 assert.match(ui,/home[.]hidden=true;embedded[.]hidden=true;detail[.]hidden=false/);
 assert.match(ui,/smart-result-buttons/);
 assert.match(ui,/function showRateTask\(site=null\)/);
 assert.match(ui,/prepareRateInline\(site\)/);
 assert.match(html,/data-smart-action="inline-rate"/);
 const tariffs=read('amministratore/company-rates.mjs');
 assert.match(tariffs,/get\('smart-embed-body'\)[?][.]contains\(get\('company-rates-editor'\)\)/);
 const report=read('amministratore/report.mjs');
 assert.match(report,/async prepareRateInline\(site\)/);
 assert.match(ui,/if\(mode==='home'\)close\(\);else resetTask\(\)/);
 assert.match(ui,/mode==='detail'\)resetTask\(\)/);
 assert.doesNotMatch(ui,/\b(?:localStorage|sessionStorage|indexedDB|innerHTML|fetch)\b/);
 assert.match(css,/[.]smart-detail-actions/);
});

test('unrelated EFFE.ERRE package is not shipped with LTS',()=>{
 assert.equal(existsSync(new URL('../effeerre/',import.meta.url)),false);
});

test('admin wake-up guard preserves unsaved forms on mobile network failure and never caches admin refresh tokens',()=>{
 const admin=read('amministratore/admin.mjs'),page=read('amministratore/index.html');
 const css=read('amministratore/admin-login-refreshed.css');
 const access=read('account-access.mjs');
 assert.match(page,/id="admin-resume-guard"/);
 assert.match(page,/id="admin-resume-retry"/);
 assert.match(page,/id="login-password-toggle"/);
 assert.match(page,/admin-login-refreshed[.]css[?]v=20261110-seamless-resume-v2/);
 assert.match(css,/admin-resume-guard/);
 assert.match(css,/admin-login-modern/);
 assert.match(admin,/function showResumeGuard\(/);
 assert.match(admin,/dashboard[.]inert=true/);
 assert.match(admin,/function hideResumeGuard\(/);
 assert.match(admin,/dashboard[.]inert=false/);
 assert.match(admin,/async function verifyDashboardOnResume\(/);
 assert.match(admin,/if\(!transientAdminError\(error\)/);
 assert.match(admin,/showResumeGuard\('Verifica non completata/);
 assert.match(admin,/adminRealtime[?][.]stop\(\)/);
 assert.doesNotMatch(admin,/dashboard[.]style[.]visibility=['"]hidden['"]/);
 assert.match(admin,/void verifyDashboardOnResume\(\)/);
 assert.match(access,/sessionStorage[.]setItem\(SESSION_KEY/);
 assert.doesNotMatch(access,/localStorage[.]setItem\(SESSION_KEY/);
 assert.match(access,/Only drivers get a durable device session/);
});
