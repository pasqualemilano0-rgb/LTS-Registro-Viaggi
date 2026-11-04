import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('dashboard accessibile solo dal pannello admin, CSP e versioni coerenti',()=>{
 const html=read('amministratore/index.html'),js=read('amministratore/admin.mjs');
 const report=read('amministratore/report.mjs'),css=read('amministratore/admin.css');
 for(const id of ['management-tab','report-tab','report-panel','report-count',
   'report-total','report-chart','report-driver-chart','report-rows','report-next','report-driver','report-month'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/admin\.mjs\?v=20261104-company-v1/);
 assert.match(html,/admin\.css\?v=20261104-company-v1/);
 assert.match(js,/account-access\.mjs\?v=20261104-company-v1/);
 assert.match(js,/setupReport\(account\)/);
 assert.match(js,/companyView\.reset\(\)/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src https:\/\/otrqynkscpbeyuvdlgpg.supabase.co/);
 assert.match(css,/\.report-bar-progress/);
 assert.match(report,/createElement\('progress'\)/);
 assert.doesNotMatch(report,/innerHTML|eval\(|\.style\./);
 assert.doesNotMatch([html,js,report].join('\n'),/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
});
test('trasporto report autenticato senza allargare archivio individuale',()=>{
 const auth=read('account-access.mjs'),runtime=read('runtime-config.mjs');
 assert.match(auth,/export async function companyReport/);
 assert.match(auth,/getRole\(\)!=='admin'/);
 assert.match(auth,/api\('reportEndpoint',payload/);
 assert.match(auth,/withSessionRetry/);
 assert.match(auth,/!isVerified\(\)/);
 assert.match(runtime,/\"reportEndpoint\": \"https:\/\/otrqynkscpbeyuvdlgpg\.supabase\.co\/functions\/v1\/lts-company-report\"/);
 assert.doesNotMatch(runtime,/sb_secret_[A-Za-z0-9_-]+|SUPABASE_SERVICE_ROLE_KEY\s*[=:]|Authorization\s*:\s*Bearer/i);
 assert.doesNotMatch(read('app.mjs'),/companyReport\(/);
});
test('sola lettura e importi registrati non spacciati per fatturato aziendale',()=>{
 const report=read('amministratore/report.mjs'),html=read('amministratore/index.html');
 assert.match(html,/Valore trasferte registrate/);
 assert.match(html,/non fatturato aziendale né stipendio/);
 assert.doesNotMatch(report,/\.update\(|\.insert\(|\.delete\(|archiveRequest\(/);
});

test('consultazione aziendale prima della pubblicazione: informativa esplicita',()=>{
 const privacy=read('privacy/index.html');
 assert.match(privacy,/Consultazione aziendale dei viaggi sincronizzati/);
 assert.match(privacy,/amministratori autorizzati/);
 assert.match(privacy,/note di viaggio e importi registrati/);
 assert.match(privacy,/non sono consultabili dall'amministratore/);
 assert.match(privacy,/non sostituisce l'informativa e gli adempimenti del datore di lavoro/);
 assert.match(privacy,/Aggiornamento: 4 novembre 2026/);
});
