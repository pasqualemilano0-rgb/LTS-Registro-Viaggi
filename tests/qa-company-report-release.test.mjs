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
 assert.match(html,/admin\.mjs\?v=20261108-smart-v2/);
 assert.match(html,/admin\.css\?v=20261104-company-v3/);
 assert.match(js,/account-access\.mjs\?v=20261107-realtime-v1/);
 assert.match(js,/setupReport\(account\)/);
 assert.match(js,/companyView\.reset\(\)/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src https:\/\/otrqynkscpbeyuvdlgpg.supabase.co/);
 assert.match(css,/\.report-bar-progress/);
 assert.match(report,/createElement\('progress'\)/);
 assert.match(report,/function driverProfile\(/);
 assert.match(report,/function driverDirectory\(/);
 assert.match(report,/function renderAmountChart\(/);
 assert.match(js,/report\.mjs\?v=20261108-smart-v2/);
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
 assert.match(html,/customer-overview\.css\?v=20261107-manual-shared-v1/);
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

test('linked Google Maps refresh distinguishes Supabase polling from reviewed place updates', async()=>{
 const html=read('amministratore/index.html');
 const overview=read('amministratore/customer-overview.mjs');
 const module=read('amministratore/maps-address-refresh.mjs');
 const css=read('amministratore/customer-overview.css');
 const report=read('amministratore/report.mjs');
 const helper=await import('../shared/maps-address-review.mjs');
 for(const id of ['customer-maps-scan','customer-maps-select-all',
  'customer-maps-results','customer-maps-preview','customer-maps-apply',
  'customer-maps-refresh-status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(report,/customer-overview[.]mjs[?]v=20261108-smart-v2/);
 assert.match(overview,/setupMapsAddressRefresh\(account/);
 assert.match(overview,/Questo controllo NON rilegge Google Maps/);
 assert.match(module,/readMapsCustomer\(site[.]mapsUrl/);
 assert.match(module,/reviewLinkedMapsAddress\(site,proposal\)/);
 assert.match(module,/window[.]confirm\(/);
 assert.match(module,/saveSharedMapsCustomer\(url/);
 assert.match(module,/if\(result[.]created\|\|!result[.]updated/);
 assert.match(css,/customer-maps-review/);
 assert.doesNotMatch(module,/innerHTML|localStorage|sessionStorage|service_role|sb_secret_/);
 const site={name:'CLIENTE GAMMA',city:'ROMA (RM)',
  address:'INDIRIZZO STRADALE DA CONFERMARE - ROMA',
  mapsUrl:'https://maps.app.goo.gl/existing'};
 const base={name:'CLIENTE GAMMA',city:'ROMA',
  address:'VIA INDUSTRIA 12, 00100 ROMA',mapsUrl:site.mapsUrl};
 assert.equal(helper.isMissingMapsAddress(site),true);
 assert.equal(helper.reviewLinkedMapsAddress(site,base).eligible,true);
 assert.equal(helper.reviewLinkedMapsAddress(site,{...base,name:'CLIENTE DIVERSO'}).eligible,false);
 assert.equal(helper.reviewLinkedMapsAddress(site,{...base,city:'MILANO'}).eligible,false);
 assert.equal(helper.reviewLinkedMapsAddress(site,{...base,mapsUrl:'https://maps.app.goo.gl/wrong'}).eligible,false);
 assert.equal(helper.reviewLinkedMapsAddress(site,{...base,address:'ROMA'}).eligible,false);
 assert.equal(helper.reviewLinkedMapsAddress({...site,address:'VIA ROMA 5'},base).eligible,false);
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

test('admin can register Google Maps sites with a company tariff and edit audited per-driver extras',()=>{
 const page=read('amministratore/index.html');
 const report=read('amministratore/report.mjs');
 const rates=read('amministratore/company-rates.mjs');
 const maps=read('amministratore/company-maps-registration.mjs');
 const extras=read('amministratore/company-extras.mjs');
 const css=read('amministratore/company-rates.css');
 for(const id of ['company-maps-url','company-maps-read','company-maps-preview',
  'company-maps-save','company-maps-status','company-maps-amount',
  'company-extra-list','company-extra-status'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/data-open-maps/);
 assert.match(report,/setupCompanyExtras\(account\)/);
 assert.match(report,/companyRates[.]focusMaps\(\)/);
 assert.match(rates,/setupCompanyMaps\(account/);
 assert.match(maps,/readMapsCustomer\(link\)/);
 assert.match(maps,/sharedMapsCustomers\(\)/);
 assert.match(maps,/saveSharedMapsCustomer\(proposal[.]mapsUrl/);
 assert.match(maps,/account[.]companyTariffs\('save'/);
 assert.match(maps,/expectedRevision:current[.]revision/);
 assert.match(maps,/matchingSite\(sites,proposal\)/);
 assert.match(extras,/account[.]companyTariffs\('list'/);
 assert.match(extras,/account[.]companyTariffs\('extra-save'/);
 assert.match(extras,/expectedRevision:shown[.]revision/);
 assert.doesNotMatch(extras,/account[.]adminRecords\('mutate'/);
 assert.match(extras,/window[.]confirm\(/);
 assert.match(css,/company-extra-row/);
 assert.doesNotMatch(page,/id="company-extra-driver"/);
 assert.match(page,/Tariffe servizi extra aziendali/);
 assert.doesNotMatch([maps,extras].join('\n'),/localStorage|innerHTML|SUPABASE_SERVICE_ROLE_KEY/);
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
 assert.match(admin,/10000\)/);
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
 assert.match(report,/openRecordsForPhone\(phone,kind='trip'\)/);
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

test('manual company customer onboarding joins the shared catalog and keeps fare optional',()=>{
 const html=read('amministratore/index.html');
 const rates=read('amministratore/company-rates.mjs');
 const manual=read('amministratore/company-manual-registration.mjs');
 const backend=read('supabase/functions/lts-shared-maps/maps-registry-handler.mjs');
 const report=read('amministratore/report.mjs');
 for(const id of ['company-manual-form','company-manual-name','company-manual-city',
  'company-manual-address','company-manual-notes','company-manual-amount',
  'company-manual-save','company-manual-status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/data-open-manual/);
 assert.match(html,/value="manual"/);
 assert.match(rates,/setupCompanyManual\(account/);
 assert.match(rates,/saveSharedManualCustomer\(\{name:payload[.]client,city:payload[.]city\}\)/);
 assert.match(report,/companyRates[.]focusManual\(\)/);
 assert.match(manual,/saveSharedManualCustomer\(customer\)/);
 assert.match(manual,/matchingRate\(response[.]tariffs,customer\)/);
 assert.match(backend,/input[.]action==='save-manual'/);
 assert.match(backend,/role!=='admin'/);
 assert.match(backend,/lts_shared_customers_manual/);
 assert.match(backend,/lts_company_tariffs/);
 assert.doesNotMatch(manual,/innerHTML|localStorage|adminRecords\('mutate'/);
});

test('driver trip picker searches Maps, manual company tariffs and personal driver customers',async()=>{
 const {buildDriverCustomerCatalog}=await import('../amministratore/driver-customer-catalog.mjs');
 const sites=buildDriverCustomerCatalog({
  sharedSites:[
   {name:'ACETIFICIO',city:'NOLA',address:'VIA A',mapsUrl:'https://maps.app.goo.gl/a'},
   {name:'ACETIFICIO',city:'NOLA',address:'VIA B',mapsUrl:'https://maps.app.goo.gl/b'}
  ],
  companyRates:[
   {client:'ACETIFICIO',city:'NOLA',cents:5000},
   {client:'CLIENTE MANUALE',city:'AVELLINO',cents:7500}
  ],
  personalCustomers:[
   {name:'CLIENTE MANUALE',city:'AVELLINO',address:'VIA PROPRIA'},
   {name:'CLIENTE PERSONALE',city:'CASERTA',address:'VIA TEST'}
  ]
 });
 assert.equal(sites.length,4);
 assert.equal(sites.filter(s=>s.source==='maps').length,2,
  'Two distinct Maps depots in the same city remain distinct');
 assert.equal(sites.filter(s=>s.source==='company').length,1);
 assert.equal(sites.filter(s=>s.source==='personal').length,1);
 assert.equal(sites.find(s=>s.name==='CLIENTE MANUALE').city,'AVELLINO');
 assert.equal(sites.find(s=>s.name==='CLIENTE PERSONALE').address,'VIA TEST');
 const source=read('amministratore/driver-records.mjs');
 const css=read('amministratore/driver-records.css');
 const html=read('amministratore/index.html');
 const report=read('amministratore/report.mjs');
 assert.match(source,/buildDriverCustomerCatalog\(/);
 assert.match(source,/companyRates:tariffs,personalCustomers/);
 assert.match(source,/input[.]type='search'/);
 assert.match(source,/role','combobox'/);
 assert.match(source,/role','listbox'/);
 assert.match(source,/records-site-option/);
 assert.match(source,/companyFareSnapshot\(rates,ratesAvailable,site[.]name,site[.]city\)/);
 assert.doesNotMatch(source,/document[.]createElement\('select'\)/);
 assert.match(css,/records-site-results\[hidden\]/);
 assert.match(css,/records-site-option-address/);
 assert.match(html,/driver-records[.]css[?]v=20261107-driver-private-customers-v1/);
 assert.match(report,/driver-records[.]mjs[?]v=20261108-rc3-v1/);
 assert.doesNotMatch([source,css].join('\n'),/innerHTML|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});

test('administrator has an MFA-only editor for each driver and all personal record kinds',()=>{
 const html=read('amministratore/index.html');
 const app=read('amministratore/admin.mjs');
 const report=read('amministratore/report.mjs');
 const editor=read('amministratore/driver-records.mjs');
 const css=read('amministratore/driver-records.css');
 const auth=read('account-access.mjs'),runtime=read('runtime-config.mjs');
 for(const id of ['records-tab','admin-records-panel','records-driver','records-refresh',
  'records-tabs','records-search','records-list','records-editor',
  'records-trips','records-customers','records-tariffs','records-revision'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(report,/\['records','records-tab','Archivi autisti'/);
 assert.match(report,/records[.]openForPhone\(phone\|\|'',recordKind\)/);
 assert.match(report,/records[.]refreshActive\(\)/);
 assert.match(app,/Apri dati e viaggi/);
  assert.match(app,/Clienti personali/);
  assert.match(app,/openRecordsForPhone\(entry[.]phone,'customer'\)/);
  assert.match(html,/data-open-private-customers/);
  assert.match(report,/open\('records',null,'customer'\)/);
  assert.match(editor,/Cliente personale di/);
  assert.match(editor,/setCategory\(kind==='customer'[?]'customer':'trip'\)/);
 assert.match(app,/companyView[.]openRecordsForPhone\(entry[.]phone\)/);
 assert.match(editor,/account[.]adminRecords\('list'\)/);
 assert.match(editor,/account[.]adminRecords\('read'/);
 assert.match(editor,/account[.]adminRecords\('mutate'/);
 assert.match(editor,/driverId:owner,expectedRevision/);
 assert.match(editor,/requestId:crypto[.]randomUUID\(\)/);
 assert.match(editor,/operation:'delete'/);
 assert.match(editor,/operation:'restore'/);
 assert.match(editor,/auditId:entry[.]id/);
 assert.match(editor,/window[.]confirm\(/);
 assert.match(editor,/openDeleteConfirmation\(item,card,actions\)/);
 assert.match(editor,/records-delete-confirm/);
 assert.match(editor,/text[.]length<8/);
 assert.doesNotMatch(editor,/window[.]prompt\(/);
 assert.match(editor,/formatMoney/);
 assert.match(editor,/extraCents/);
 assert.match(editor,/Tariffa personale/);
 assert.match(html,/Tariffe aziendali/);
 assert.match(css,/records-danger/);
 assert.match(auth,/export async function adminRecords/);
 assert.match(auth,/getRole\(\)!=='admin'/);
 assert.match(auth,/adminRecordsEndpoint/);
 assert.match(runtime,/\/functions\/v1\/lts-admin-records/);
});
test('server verifies MFA, owns archive CAS and logs every privileged edit atomically',()=>{
 const backend=read('server/admin-records-core.mjs');
 const pure=read('shared/admin-record-operations.mjs');
 assert.match(backend,/clients[.]public[.]auth[.]getUser\(match\[1\]\)/);
 assert.match(backend,/await checkLtsSession/);
 assert.match(backend,/await requireAdminMfa/);
 assert.match(backend,/mfa[?][.]verified!==true/);
 assert.match(backend,/access[.]role!=='admin'/);
 assert.match(backend,/data[.]role!=='driver'/);
 assert.match(backend,/p_expected_revision:current[.]revision/);
 assert.match(backend,/lts_admin_archive_commit/);
 assert.match(backend,/lts_admin_archive_audit/);
 assert.match(backend,/beforeRevision/);
 assert.match(backend,/expectedRevision!==current[.]revision/);
 assert.match(backend,/eq\('role','driver'\)/);
 assert.doesNotMatch(backend,/innerHTML|eval\(/);
 assert.match(pure,/validateState\(raw\)/);
 assert.match(pure,/createdAt:existing[?][.]createdAt/);
 assert.match(pure,/restoreRecord/);
 assert.match(read('tests/qa-admin-records-live.test.mjs'),/Unauthenticated admin request must be rejected/);
});

test('personal customer Maps certification is explicit, deduplicated and auditable',()=>{
 const editor=read('amministratore/driver-records.mjs');
 const view=read('amministratore/personal-customer-maps-ui.mjs');
 const matching=read('amministratore/personal-customer-certification.mjs');
 const theme=read('visual-theme.css');
 assert.match(editor,/if\(kind==='customer'&&item\)/);
 assert.match(editor,/attachPersonalCustomerCertification/);
 assert.match(editor,/removePersonal:reason=>mutate\(\{operation:'delete',category:'customer'/);
 assert.match(view,/readMapsCustomer\(url,\{signal:abort[.]signal\}\)/);
 assert.match(view,/await sharedMapsCustomers\(\)/);
 assert.match(view,/reviewPersonalCustomerCertification/);
 assert.match(view,/await saveSharedMapsCustomer\(proposal[.]mapsUrl/);
 assert.match(view,/const done=await removePersonal\(/);
 assert.match(view,/checked[.]checked/);
 assert.match(view,/I viaggi non sono stati modificati/);
 assert.match(matching,/normalizedStreetKey/);
 assert.match(theme,/records-certify-panel/);
 assert.doesNotMatch(view,/localStorage|innerHTML|window[.]prompt/);
});

test('admin archive displays verified operational filters and conservative statuses',()=>{
 const html=read('amministratore/index.html');
 const source=read('amministratore/driver-records.mjs');
 const helper=read('amministratore/records-intelligence.mjs');
 const css=read('visual-theme.css');
 for(const id of ['records-worklist','records-worklist-subtitle','records-worklist-primary',
  'records-quick-filters','records-data-quality','records-shared-status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(source,/refreshShared\(/);
 assert.match(source,/archiveCustomerMetrics/);
 assert.match(source,/customerMatchesQuickFilter/);
 assert.match(source,/tripWorklistSummary/);
 assert.match(source,/openEditor\(item,\{focusCertification:true\}\)/);
 assert.match(source,/record[s]-customer-details/);
 assert.match(css,/records-customer-card/);
 assert.match(css,/records-quality-grid/);
 assert.match(helper,/normalizedStreetKey/);
 assert.doesNotMatch(helper,/deleteRecord|window[.]confirm|localStorage/);
});
