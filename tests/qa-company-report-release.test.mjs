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
 assert.match(html,/admin\.mjs\?v=20261107-client-tariff-sync-v2/);
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
 assert.match(js,/report\.mjs\?v=20261107-client-tariff-sync-v2/);
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
 assert.match(html,/customer-overview\.css\?v=20261107-client-tariff-sync-v2/);
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

test('panoramica clienti apre la tariffa della sede Google Maps senza duplicare archivi',()=>{
 const overview=read('amministratore/customer-overview.mjs');
 const editor=read('amministratore/company-rates.mjs');
 const report=read('amministratore/report.mjs');
 const html=read('amministratore/index.html');
 assert.match(overview,/setupCustomerOverview\(account,onSetRate=null\)/);
 assert.match(overview,/if\(active\(\)\)onSetRate\(row\)/);
 assert.match(report,/open\('rates'\);companyRates[.]prefillSite\(site\)/);
 assert.match(editor,/tariffLinkedCustomerSites\(sites,rows,search[.]value\)/);
 assert.match(editor,/await account[.]companyTariffs\('save',payload\)/);
 assert.match(editor,/sharedMapsCustomers\(\)/);
 assert.match(editor,/ratesLoaded/);
 assert.match(html,/Clienti Google Maps da tariffare/);
 assert.match(html,/id="company-sites-list"/);
 assert.match(html,/id="company-rate-client-options"/);
 assert.doesNotMatch(editor,/saveSharedMapsCustomer|state[.]customers|localStorage|innerHTML/);
});

test('dashboard automatically refreshes the active verified section without losing unsaved edits',()=>{
 const admin=read('amministratore/admin.mjs');
 const report=read('amministratore/report.mjs');
 const rates=read('amministratore/company-rates.mjs');
 const directory=read('amministratore/customer-overview.mjs');
 const html=read('amministratore/index.html');
 for(const id of ['customer-overview-priced','customer-overview-unpriced','customer-overview-sync-status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(admin,/setInterval\(\(\)=>\{/);
 assert.match(admin,/45000\)/);
 assert.match(admin,/if\(dashboard[.]dataset[.]view==='drivers'\)/);
 assert.match(admin,/else companyView[.]refreshActive\(\)/);
 assert.match(admin,/restoreAdminPosition\(saved\)/);
 assert.match(admin,/companyView[.]refreshActive\(\)/);
 assert.match(report,/function refreshActive\(\)/);
 assert.match(report,/companyRates[.]load\(\{silent:true\}\)/);
 assert.match(report,/companyDirectory[.]load\(\{silent:true\}\)/);
 assert.match(report,/load\(false,\{silent:true\}\)/);
 assert.match(report,/rows[.]length>40/);
 assert.match(report,/Nessuna variazione nei viaggi ricevuti/);
 assert.match(report,/mostrato l’ultimo report ricevuto/);
 assert.match(report,/return \{reset,open,refreshActive\}/);
 assert.match(directory,/Promise[.]allSettled\(/);
 assert.match(directory,/account[.]companyTariffs\('list'\)/);
 assert.match(directory,/tariffLinkedCustomerSites\(records,tariffRows\)/);
 assert.match(directory,/Sincronizzazione non completa/);
 assert.match(directory,/if\(changed\|\|!silent\)render\(\)/);
 assert.match(rates,/form[.]contains\(document[.]activeElement\)/);
 assert.match(rates,/if\(changed\|\|!silent\)/);
 assert.match(rates,/const nextRates=validRates\?rateResult[.]value[.]tariffs:rows/);
 assert.match(rates,/Ultimo|ultimi disponibili/i);
 assert.doesNotMatch([admin,report,rates,directory].join('\n'),/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});
