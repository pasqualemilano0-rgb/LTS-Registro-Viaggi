import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,createTrip,reconcileTripTariffs,findTariff} from '../shared/domain.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rate={id:'company:123e4567-e89b-42d3-a456-426614174000',customerId:null,
 client:'AZIENDA ALFA',city:'ROMA',cents:8550};
function newTrip(id,date,old=null){
 const basic=createTrip({date,container:'MSDU3456768',client:'AZIENDA ALFA',city:'ROMA',
  services:[],note:''},emptyState());
 return {...basic,id,fareCents:old};
}
test('company rate only fills missing journeys, keeps previously recorded prices',()=>{
 const original={...emptyState(),tariffs:[rate],
  trips:[newTrip('missing','2026-11-03'),newTrip('manual','2026-11-04',9900)]};
 const result=reconcileTripTariffs(original);
 assert.equal(result.trips[0].fareCents,8550);
 assert.equal(result.trips[1].fareCents,9900);
 assert.equal(result.trips[1].updatedAt,original.trips[1].updatedAt);
 assert.equal(findTariff(result,'Azienda Alfa','roma').cents,8550);
});
test('changing corporate amount does not recalculate historical explicit snapshots',()=>{
 const original={...emptyState(),tariffs:[{...rate,cents:15000}],
  trips:[newTrip('old','2026-10-03',8550),newTrip('new','2026-11-04')]};
 const result=reconcileTripTariffs(original);
 assert.deepEqual(result.trips.map(t=>t.fareCents),[8550,15000]);
});
test('personal rate changes retain existing client-specific recalculation behavior',()=>{
 const state={...emptyState(),tariffs:[{id:'personal-1',customerId:null,
  client:'AZIENDA ALFA',city:'ROMA',cents:6200}],
  trips:[newTrip('old','2026-10-02',5200),newTrip('missing','2026-11-01')]};
 const result=reconcileTripTariffs(state);
 assert.deepEqual(result.trips.map(t=>t.fareCents),[6200,6200]);
});
test('company tariffs are limited to verified admin UI and the restricted backend',()=>{
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
 assert.match(read('app.mjs'),/Tariffa aziendale gestita dall’amministratore/);
});

test('drivers see company tariffs as read-only, with manual and automatic refresh',()=>{
 const app=read('app.mjs'),store=read('client-store.mjs');
 assert.match(app,/tariff[.]id[.]startsWith\('company:'\)/);
 assert.match(app,/Tariffa aziendale · sincronizzata/);
 assert.match(app,/Sola lettura/);
 assert.match(app,/Aggiorna tariffe/);
 assert.match(app,/await store[.]syncPending\(\)/);
 assert.match(app,/next==='tariffs'&&store[.]usingAccount\(\)/);
 assert.match(store,/setInterval\(refreshSoon, 20000\)/);
 assert.match(store,/window[.]addEventListener\('online', refreshSoon\)/);
 assert.match(store,/document[.]addEventListener\('visibilitychange'/);
 const css=read('app.css');
 assert.match(css,/tariff-company-sync/);
});
