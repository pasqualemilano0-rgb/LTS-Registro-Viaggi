import test from 'node:test';
import assert from 'node:assert/strict';
import {conatecoForecastDelivery} from '../porti/delivery_location.mjs';
import {readFileSync} from 'node:fs';
const now=new Date('2026-11-27T08:00:00Z');
const base={category:'PREVISTE',vessel_status:'PRE',acceptance_flag:'1',acceptance_icon:'ACCETTA_CARICO',stop_cargo:'NO',opening:'2026-11-27 07:00',closing:'2026-11-28 18:00',eta:'2026-11-28 00:00'};
const states={good:{},bad:{acceptance_flag:'0',acceptance_icon:'NO_ACCETTA_CARICO'},unknown:{acceptance_flag:'',acceptance_icon:''}};
for(const [kind,fields] of Object.entries(states))for(const [flag,expected] of [['S','good'],['N','warn'],['','unknown']]){
 test('independent CNT '+kind+'/'+(flag||'blank'),()=>{
  const row={...base,...fields,external_depot:flag},feed={rows:[row],acquired_at:now.toISOString()};
  const p=conatecoForecastDelivery(row,feed,now);
  assert.equal(p.internal.kind,kind);assert.equal(p.external.kind,expected);assert.equal(p.known,false);
  assert.equal(p.internal.visible,kind!=='unknown');assert.equal(p.external.visible,flag!=='');
  assert.match(p.note,/booking/);
  assert.equal(p.internal.label,kind==='good'?'ACCETTA CARICO':kind==='bad'?'NON ACCETTA CARICO':'DA VERIFICARE');
  assert.equal(p.external.label,expected==='good'?'ACCETTA CARICO':'DA VERIFICARE');
 });
}
test('stale, failed, conflicting and missing data never show green',()=>{
 const row={...base,external_depot:'S'},feed={rows:[row],acquired_at:now.toISOString()};
 for(const [r,f] of [[row,{...feed,acquired_at:'2026-11-26T00:00:00Z'}],[row,{...feed,refresh_failed:true}],[{...row,source_conflict:true},feed],[null,feed]]){
  const p=conatecoForecastDelivery(r,f,now);assert.equal(p.internal.kind,'unknown');assert.equal(p.external.kind,'unknown');assert.equal(p.internal.visible,true);assert.equal(p.external.visible,true);
 }
});
test('blocked and expired internal status never suppresses the external signal',()=>{
 for(const fields of [{stop_cargo:'SI'},{closing:'2026-11-26 18:00'}]){
  const row={...base,...fields,external_depot:'S'},p=conatecoForecastDelivery(row,{rows:[row],acquired_at:now.toISOString()},now);
  assert.equal(p.internal.kind,'bad');assert.equal(p.external.kind,'good');
 }
});
test('CNT detail and fleet use independent presentation, not duplicated panel',()=>{
 const app=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(place.terminal==='cnt'\)return cntAcceptancePanel\(place\)/);
 assert.match(app,/if\(place.terminal==='cnt'\)return cntAcceptancePanel\(place,true\)/);
 const detail=app.slice(app.indexOf('function renderCntShipDetails'),app.indexOf('function renderCntFleet'));
 assert.doesNotMatch(detail,/depotAcceptancePanel|badge\(verdict/);
});

test('missing fields hide only on fresh coherent rows; malformed and stale signals remain visible',()=>{
 const row={...base,acceptance_flag:'',acceptance_icon:'',external_depot:''};
 const feed={rows:[row],acquired_at:now.toISOString()};
 const absent=conatecoForecastDelivery(row,feed,now);assert.equal(absent.internal.visible,false);assert.equal(absent.external.visible,false);
 for(const [r,f] of [[{...row,acceptance_flag:'X',external_depot:'X'},feed],[row,{...feed,refresh_failed:true}],[{...row,source_conflict:true},feed]]){
  const p=conatecoForecastDelivery(r,f,now);assert.equal(p.internal.visible,true);assert.equal(p.external.visible,true);assert.equal(p.internal.label,'DA VERIFICARE');assert.equal(p.external.label,'DA VERIFICARE');
 }
});
