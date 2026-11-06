import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('dashboard accessibile solo dal pannello admin, CSP e versioni coerenti',()=>{
 const html=read('amministratore/index.html'),js=read('amministratore/admin.mjs');
 const report=read('amministratore/report.mjs'),css=read('amministratore/admin.css');
 for(const id of ['management-tab','report-tab','report-panel','report-count',
   'report-total','report-chart','report-amount-chart','report-driver-chart','report-rows',
   'report-next','report-driver','report-month','report-driver-profile','report-profile-title',
   'report-profile-average','report-driver-cards','report-driver-search','report-reset-filters',
   'pro-insights','pro-trend','pro-trend-months','pro-from','pro-to','pro-client',
   'pro-city','pro-container','pro-compare-driver','pro-alerts','pro-alert-count',
   'pro-export-pdf','pro-export-xlsx','pro-records'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/admin\.mjs\?v=20261106-company-rates-v1/);
 assert.match(html,/admin\.css\?v=20261104-company-v3/);
 assert.match(js,/account-access\.mjs\?v=20261106-company-tariffs-v1/);
 assert.match(js,/setupReport\(account\)/);
 assert.match(js,/companyView\.reset\(\)/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src https:\/\/otrqynkscpbeyuvdlgpg.supabase.co/);
 assert.match(css,/\.report-bar-progress/);
 assert.match(report,/createElement\('progress'\)/);
 assert.match(report,/function driverProfile\(/);
 assert.match(report,/function driverDirectory\(/);
 assert.match(report,/function renderAmountChart\(/);
 assert.match(js,/report\.mjs\?v=20261106-company-rates-v1/);
 assert.match(report,/setupInsights\(account\)/);
 const advanced=read('amministratore/report-insights.mjs');
 const exportsModule=read('amministratore/report-export.mjs');
 assert.match(advanced,/companyInsights\(/);
 assert.match(advanced,/downloadXlsx\(/);
 assert.match(advanced,/downloadPdf\(/);
 assert.match(exportsModule,/export function makeXlsx/);
 assert.match(exportsModule,/export function makePdf/);
 assert.doesNotMatch(advanced,/innerHTML|eval\(|document\.write\(/);
 
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
 assert.match(html,/non fatturato aziendale, guadagno netto o stipendio/);
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

test('anagrafica dashboard: dati verificati dalla sessione, soli campi pubblici, nessun dato simulato', async()=>{
 const html=read('amministratore/index.html');
 const report=read('amministratore/report.mjs');
 const ui=read('amministratore/customer-overview.mjs');
 const css=read('amministratore/customer-overview.css');
 for(const id of ['customer-overview','customer-overview-total','customer-overview-complete',
   'customer-overview-missing','customer-overview-percent','customer-overview-progress',
   'customer-overview-filter','customer-overview-list','customer-overview-refresh',
   'customer-overview-more'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/customer-overview\.css\?v=20261106-directory-v1/);
 assert.match(report,/companyDirectory\.reset\(\)/);
 assert.match(report,/companyDirectory\.load\(\)/);
 assert.match(ui,/sharedMapsCustomers\(\)/);
 assert.match(ui,/account\.isVerified\(\)/);
 assert.match(ui,/account\.getRole\(\)==='admin'/);
 assert.match(ui,/rel='noopener noreferrer'/);
 assert.doesNotMatch(ui,/innerHTML|localStorage|sessionStorage|eval\(/);
 assert.match(css,/#dashboard:not\(\[data-view="overview"\]\) #customer-overview/);
 const model=await import('../amministratore/customer-overview-model.mjs');
 const samples=[
  {name:'B',city:'NAPOLI',address:'INDIRIZZO STRADALE DA CONFERMARE - NAPOLI'},
  {name:'A',city:'ROMA',address:'VIA ESEMPIO 10, ROMA'},
  {name:'C',city:'MILANO',address:'SANTA PALOMBA (INDIRIZZO STRADALE DA CONFERMARE)'}
 ];
 assert.equal(model.hasUsableAddress('SANTA PALOMBA (INDIRIZZO STRADALE DA CONFERMARE)'),false);
 assert.equal(model.hasUsableAddress('Via Roma 1, Milano'),true);
 assert.deepEqual(model.customerDirectoryStats(samples),{total:3,complete:1,incomplete:2,coverage:33});
 assert.equal(model.selectedCustomerSites(samples,'incomplete').length,2);
 assert.equal(model.selectedCustomerSites(samples,'complete')[0].name,'A');
});
