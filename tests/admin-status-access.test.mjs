import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {summarizeAdminRuns} from '../amministratore/admin-status.mjs';

const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('legacy public status is retired and redirects to administrator login',()=>{
 const legacy=text('status/index.html');
 assert.match(legacy,/http-equiv="refresh" content="0;url=\.\.\/amministratore\/"/);
 assert.match(legacy,/Area riservata/);
 assert.doesNotMatch(legacy,/<script\b|api\.github\.com|status\.mjs|diagnostica dettagliata/i);
 assert.equal(existsSync(new URL('../status/status.mjs',import.meta.url)),false);
 assert.equal(existsSync(new URL('../status/status.css',import.meta.url)),false);
 assert.equal(existsSync(new URL('../status/manifest.webmanifest',import.meta.url)),false);
 const worker=text('status/sw.js');
 assert.match(worker,/caches\.delete/);
 assert.match(worker,/registration\.unregister/);
 assert.doesNotMatch(worker,/showNotification|fetch\(.+api\.github/);
});
test('admin status panel lives only inside protected dashboard',()=>{
 const html=text('amministratore/index.html');
 const dashboard=html.indexOf('<div id="dashboard" hidden>');
 const status=html.indexOf('id="admin-status-console"');
 const endDashboard=html.indexOf('</body>');
 assert.ok(dashboard>=0&&status>dashboard&&status<endDashboard);
 assert.match(html,/id="admin-status-refresh"/);
 assert.match(html,/https:\/\/api\.github\.com/);
 const admin=text('amministratore/admin.mjs');
 assert.match(admin,/setupAdminStatus\(account\)/);
 assert.match(admin,/adminStatus\.reset\(\)/);
 assert.doesNotMatch(text('index.html'),/LTS Control Center|\/status\//);
});
test('admin status cannot request service data before server verification and MFA',()=>{
 const source=text('amministratore/admin-status.mjs');
 const verification=source.indexOf('const session=await account.verifySession()');
 const mfa=source.indexOf('session?.mfa_enrolled!==true||session?.mfa_verified!==true');
 const github=source.indexOf('const response=await fetch(API');
 assert.ok(verification>0&&mfa>verification&&github>mfa);
 assert.match(source,/account\.getRole\(\)==='admin'/);
 assert.match(source,/account\.isVerified\(\)/);
 assert.match(source,/window\.addEventListener\('lts-account-locked'/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
test('stale and failure states are never presented as healthy',()=>{
 const now=Date.parse('2026-11-09T17:00:00Z');
 const monitor={id:1,name:'LTS Control Center — monitor disponibilita gratuito',
  created_at:'2026-11-09T16:00:00Z',status:'completed',conclusion:'success'};
 const deploy={id:2,name:'pages build and deployment',
  created_at:'2026-11-09T16:10:00Z',status:'completed',conclusion:'success'};
 assert.equal(summarizeAdminRuns([monitor,deploy],now).health,'superato');
 assert.equal(summarizeAdminRuns([monitor,deploy],now).release,'riuscita');
 assert.equal(summarizeAdminRuns([monitor,deploy],now+4*60*60*1000).health,'non recente');
 assert.equal(summarizeAdminRuns([{...monitor,conclusion:'failure'},deploy],now).health,'anomalia');
 assert.equal(summarizeAdminRuns([monitor,{...deploy,conclusion:'failure'}],now).release,'anomalia');
 assert.equal(summarizeAdminRuns([],now).health,'non recente');
});
