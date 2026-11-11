import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIVE_SERVICES,SERVICES,emptyState,createTrip,validateState,tripAmounts} from '../shared/domain.mjs';
import {companyExtraSnapshot} from '../shared/company-extras.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Standalone REEFER is retired from new extras but FACCHINAGGIO REEFER is still active',()=>{
 assert.equal(SERVICES.length,8,'The historical schema stays backward-compatible');
 assert.equal(ACTIVE_SERVICES.length,7);
 assert.equal(ACTIVE_SERVICES.some(service=>service.key==='reefer'),false);
 assert.equal(ACTIVE_SERVICES.some(service=>service.key==='facchinaggioReefer'),true);
 const ids=ACTIVE_SERVICES.map(s=>s.key);
 assert.equal(new Set(ids).size,7);
});

test('Existing REEFER journey snapshots remain readable and retain their totals',()=>{
 const old=createTrip({
  id:'old-reefer',date:'2026-11-01',client:'CLIENTE',city:'ROMA',
  container:'MSDU3456768',services:['reefer'],
 },emptyState());
 old.extraCents.reefer=5000;
 const historical=validateState({...emptyState(),trips:[old]});
 assert.equal(historical.trips[0].extraCents.reefer,5000);
 assert.deepEqual(historical.trips[0].services,['reefer']);
 assert.equal(tripAmounts(historical.trips[0]).extraCents,5000);
 assert.equal(companyExtraSnapshot([{serviceKey:'reefer',cents:9999}],true,'reefer'),null);
 assert.equal(companyExtraSnapshot([],false,'reefer',{unchanged:true,previous:5000}),5000);
});

test('New journey selectors and shared catalog never offer standalone REEFER',()=>{
 const app=read('app.mjs');
 const admin=read('amministratore/company-extras.mjs');
 const records=read('amministratore/driver-records.mjs');
 assert.match(app,/D[.]ACTIVE_SERVICES[.]map\(service=>el\('label'/);
 assert.match(app,/list[.]replaceChildren\([.][.][.]D[.]ACTIVE_SERVICES[.]map/);
 assert.match(admin,/for\(const service of ACTIVE_SERVICES\)/);
 assert.match(records,/if\(category==='extra'\)data=ACTIVE_SERVICES[.]map/);
 assert.match(records,/box[.]disabled=legacy/);
 assert.match(records,/rate[.]disabled=legacy/);
 assert.match(app,/retiredReeferInEdit\?\['reefer'\]:\[\]/);
 assert.match(records,/historicalReefer/);
});

test('Server disables writes to REEFER but retains eight-key read API during upgrade',()=>{
 const server=read('supabase/functions/lts-company-tariffs/tariff-handler.mjs');
 assert.match(server,/const WRITABLE_EXTRA_KEYS=new Set\(\[...EXTRA_KEYS\][.]filter\(key=>key!=='reefer'\)\)/);
 assert.match(server,/if\(!WRITABLE_EXTRA_KEYS[.]has\(input[.]serviceKey\)/);
 assert.match(server,/return data[.]map\(extraProjection\)/);
 assert.match(server,/data[.]length!==EXTRA_KEYS[.]size/);
 assert.doesNotMatch(server,/delete\(\)[\s\S]*eq\('service_key','reefer'\)/);
});
