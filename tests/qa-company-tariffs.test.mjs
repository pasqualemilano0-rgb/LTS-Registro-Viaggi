import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,createTrip,reconcileTripTariffs} from '../shared/domain.mjs';
import {companyFareSnapshot} from '../shared/company-fares.mjs';
import {tariffLinkedCustomerSites,customerSiteRateKey} from '../amministratore/customer-overview-model.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const company=[{id:'company:123e4567-e89b-42d3-a456-426614174000',customerId:null,
 client:'AZIENDA ALFA',city:'ROMA',cents:8550}];
function oldTrip(id,date,cents){
 const trip=createTrip({date,container:'MSDU3456768',client:'AZIENDA ALFA',city:'ROMA',
  services:[],note:''},emptyState());
 return {...trip,id,fareCents:cents};
}
test('a new transfer gets the same central rate for every driver, not legacy personal prices',()=>{
 const localA={...emptyState(),tariffs:[{id:'old-personal',customerId:null,client:'AZIENDA ALFA',city:'ROMA',cents:6000}]};
 const localB={...emptyState(),tariffs:[{id:'old-personal-b',customerId:null,client:'AZIENDA ALFA',city:'ROMA',cents:9700}]};
 assert.notEqual(localA.tariffs[0].cents,localB.tariffs[0].cents);
 assert.equal(companyFareSnapshot(company,true,'Azienda Alfa','Roma'),8550);
 assert.equal(companyFareSnapshot(company,true,'AZIENDA ALFA','ROMA'),8550);
 assert.equal(companyFareSnapshot(company,true,'AZIENDA ALFA','MILANO'),null);
});
test('offline or unavailable corporate catalog never falls back to driver-private fares',()=>{
 assert.equal(companyFareSnapshot(company,false,'AZIENDA ALFA','ROMA'),null);
 assert.equal(companyFareSnapshot([],true,'AZIENDA ALFA','ROMA'),null);
});
test('editing an old journey preserves its historical transfer snapshot',()=>{
 assert.equal(companyFareSnapshot([{...company[0],cents:15000}],true,'AZIENDA ALFA','ROMA',
  {unchanged:true,previous:8550}),8550);
 assert.equal(companyFareSnapshot([{...company[0],cents:15000}],true,'AZIENDA ALFA','ROMA',
  {unchanged:false,previous:8550}),15000);
});
test('private legacy tariffs cannot reprice historical or newly saved company fares during archive sync',()=>{
 const state={...emptyState(),tariffs:[{id:'private-legacy',customerId:null,
  client:'AZIENDA ALFA',city:'ROMA',cents:6000}],
  trips:[oldTrip('historic','2026-10-02',5200),oldTrip('company','2026-11-01',8550),
   oldTrip('unpriced','2026-11-02',null)]};
 const result=reconcileTripTariffs(state);
 assert.deepEqual(result.trips.map(t=>t.fareCents),[5200,8550,null]);
});
test('only verified administrators edit central tariffs',()=>{
 const html=read('amministratore/index.html'),admin=read('amministratore/report.mjs');
 const account=read('account-access.mjs'),runtime=read('runtime-config.mjs');
 const editor=read('amministratore/company-rates.mjs'),css=read('amministratore/company-rates.css');
 assert.match(html,/id="rates-tab"/);
 for(const id of ['company-rates','company-rates-form','company-rate-client','company-rate-city',
  'company-rate-amount','company-rate-submit','company-rates-list','company-rates-status'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(admin,/setupCompanyRates\(account\)/);
 assert.match(admin,/view==='rates'/);
 assert.match(account,/getRole\(\)!=='admin'/);
 assert.match(account,/companyTariffs\(/);
 assert.match(runtime,/functions\/v1\/lts-company-tariffs/);
 assert.match(editor,/textContent/);
 assert.doesNotMatch(editor,/innerHTML|localStorage|sessionStorage|service_role|sb_secret_/);
 assert.match(css,/#dashboard\[data-view="rates"\]/);
});
test('drivers browse grouped company tariffs without being able to edit them',()=>{
 const app=read('app.mjs'),store=read('client-store.mjs');
 assert.match(app,/company-route-catalog/);
 assert.match(app,/company-route-heading/);
 assert.match(app,/company-route-list/);
 assert.match(app,/filterSharedCustomers\(companyRates[.]map\(rate=>/);
 assert.match(app,/Un solo tariffario aziendale/);
 assert.match(app,/Il listino è vuoto: l’amministratore deve inserire le trasferte/);
 assert.match(app,/await store[.]syncPending\(\)/);
 assert.match(app,/\['insert','tariffs','customers'\][.]includes\(next\)/);
 assert.doesNotMatch(app,/Nuova tariffa personale|Aggiungi tariffa personale|function tariffDialog\(/);
 assert.match(store,/setInterval\(refreshSoon, 20000\)/);
 assert.match(store,/window[.]addEventListener\('online', refreshSoon\)/);
 assert.match(store,/document[.]addEventListener\('visibilitychange'/);
 const css=read('app.css');
 assert.match(css,/tariff-company-sync/);
 assert.match(css,/company-route-card/);
});
test('driver trip creation and preview use the central company catalog on first and second pickup',()=>{
 const app=read('app.mjs'),access=read('account-access.mjs');
 assert.match(app,/refreshCompanyRates\(/);
 assert.match(app,/companyRatesLoaded/);
 assert.match(app,/D[.]createTrip\(draft,\{[.][.][.]state,tariffs:\[\]\},existing\)/);
 assert.match(app,/trip[.]fareCents=companyFareSnapshot\(/);
 assert.match(app,/trip[.]secondFareCents=trip[.]secondCity\?companyFareSnapshot\(/);
 assert.match(app,/candidate=\{[.][.][.]draft/);
 assert.match(app,/await Promise[.]all\(\[store[.]syncPending\(\),refreshCompanyRates/);
 assert.match(access,/export async function driverCompanyTariffs\(/);
 assert.match(access,/action:'list'/);
 assert.match(app,/companyRatesRequest\+\+/);
 assert.match(app,/tab==='tariffs'&&tariffTab==='base'/);
});

test('company Maps sites connect to an exact centrally-priced client and location without merging sites',()=>{
 const sites=[
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA (NA)',address:'VIA DELLE INDUSTRIE'},
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'SAN GIOVANNI A TEDUCCIO',address:'INDIRIZZO STRADALE DA CONFERMARE'},
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA (NA)',address:'DUPLICATE'}
 ];
 const rates=[{client:'Acetificio Andrea Milano SRL',city:'Acerra (NA)',cents:8550}];
 const found=tariffLinkedCustomerSites(sites,rates);
 assert.deepEqual([found.total,found.priced,found.unpriced],[2,1,1]);
 assert.equal(found.sites.filter(site=>!site.hasRate)[0].city,'SAN GIOVANNI A TEDUCCIO');
 assert.equal(found.sites.filter(site=>site.hasRate)[0].city,'ACERRA (NA)');
 assert.equal(tariffLinkedCustomerSites(sites,rates,'Giovanni').sites.length,1);
 assert.equal(tariffLinkedCustomerSites(sites,rates,'confermare').sites.length,0);
 assert.equal(customerSiteRateKey(sites[0]),customerSiteRateKey({...sites[0],name:'acetificio andrea milano srl'}));
 assert.equal(sites.length,3);
 assert.equal(rates[0].cents,8550);
});
test('admin rate catalog loads both protected Maps customers and company tariff prices',()=>{
 const editor=read('amministratore/company-rates.mjs');
 const html=read('amministratore/index.html');
 const report=read('amministratore/report.mjs');
 const overview=read('amministratore/customer-overview.mjs');
 assert.match(editor,/account[.]companyTariffs\('list'\)/);
 assert.match(editor,/sharedMapsCustomers\(\)/);
 assert.match(editor,/Promise[.]allSettled\(/);
 assert.match(editor,/getRole\(\)==='admin'/);
 assert.match(editor,/customerChoices\(\)/);
 assert.match(editor,/cityChoices\(\)/);
 assert.match(editor,/tariffLinkedCustomerSites\(sites,rows/);
 assert.match(editor,/prefillSite\(site\)/);
 assert.match(editor,/rows[.]some\(rate=>clean\(rate[.]client\)===name/);
 assert.match(editor,/await account[.]companyTariffs\('save',payload\)/);
 assert.match(editor,/Gli importi storici restano invariati/);
 assert.doesNotMatch(editor,/upsertCustomer|state[.]customers|saveSharedMapsCustomer|innerHTML/);
 for(const id of ['company-sites-list','company-sites-count','company-sites-more',
  'company-rate-client-options','company-rate-city-options'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(report,/companyRates[.]prefillSite\(site\)/);
 assert.match(overview,/if\(active\(\)\)onSetRate\(row\)/);
 assert.match(overview,/Imposta tariffa/);
});
