import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOperationalChecks,inspectContainer,buildOperationalSuggestions} from '../shared/operational-checks.mjs';
import {tripAmounts} from '../shared/domain.mjs';

const draft={date:'2026-11-11',container:'BILICO',client:'ACME SRL',city:'NAPOLI',
 secondClient:'',secondCity:'',services:[],note:''};

test('domain errors are certain and every finding carries field, code, evidence and trip identities',()=>{
 const result=collectOperationalChecks({...draft,id:'x',city:'',date:'2026-02-30'});
 assert.equal(result.valid,false);
 assert.ok(result.checks.some(row=>row.field==='city'&&row.confidence==='certain'));
 assert.ok(result.checks.some(row=>row.field==='date'&&row.code==='invalid_date'));
 for(const check of result.checks){
  assert.ok(check.message&&check.code&&check.field);
  assert.ok(check.evidence&&typeof check.evidence==='object');
  assert.deepEqual(check.tripIds,['x']);
 }
});

test('special descriptions remain permitted and ISO checksum/shape findings are advisory',()=>{
 for(const container of ['BILICO','BILICO CON SPONDA','TRASPORTO ECCEZIONALE']){
  const result=collectOperationalChecks({...draft,container});
  assert.equal(result.valid,true);
  assert.equal(result.container.kind,'special');
  assert.equal(result.checks.length,0);
 }
 assert.deepEqual(inspectContainer('CSQU305438.3'),{kind:'iso-valid',iso:true,checksumValid:true});
 const checksum=collectOperationalChecks({...draft,container:'CSQU3054384'});
 assert.equal(checksum.valid,true);
 assert.equal(checksum.checks[0].code,'container_iso_checksum');
 assert.equal(checksum.checks[0].confidence,'possible');
 const shape=collectOperationalChecks({...draft,container:'CSQX3054383'});
 assert.equal(shape.valid,true);
 assert.equal(shape.checks[0].code,'container_iso_shape');
});

test('missing catalogue while offline is unknown; an explicit configured zero is valid',()=>{
 for(const companyRatesLoaded of [false,undefined]){
  const result=collectOperationalChecks({...draft,fareCents:null},{companyRatesLoaded,companyRates:[]});
  assert.equal(result.checks.some(row=>row.code==='tariff_missing'),false);
 }
 const loaded=collectOperationalChecks(draft,{companyRatesLoaded:true,companyRates:[]});
 assert.equal(loaded.checks.find(row=>row.code==='tariff_missing').evidence.source,'loaded-company-rates');
 assert.equal(collectOperationalChecks(draft,{companyRatesLoaded:true,companyRates:[
  {client:'ACME SRL',city:'NAPOLI',cents:0}]}).checks.length,0);
 const alias=collectOperationalChecks({...draft,client:'ACME-SRL'},{companyRatesLoaded:true,companyRates:[
  {client:'ACME SRL',city:'NAPOLI',cents:12345}]});
 assert.equal(alias.checks.some(row=>row.code==='tariff_missing'),true);
});

test('historical snapshots take precedence over current catalogues and preserve retired REEFER',()=>{
 const saved={...draft,id:'old',fareCents:1500,services:['reefer'],extraCents:{reefer:1234}};
 const original=structuredClone(saved),before=tripAmounts(saved);
 const result=collectOperationalChecks(saved,{previous:saved,companyRatesLoaded:true,
  companyRates:[{client:'ACME SRL',city:'NAPOLI',cents:9999}],extraRatesLoaded:true,
  extraRates:[{serviceKey:'reefer',cents:null}]});
 assert.deepEqual(result.checks,[]);
 assert.deepEqual(saved,original);
 assert.deepEqual(tripAmounts(saved),before);
 const missing=collectOperationalChecks({...saved,fareCents:null});
 assert.equal(missing.checks.find(row=>row.code==='tariff_missing').evidence.source,'historical-snapshot');
});

test('second pickup price absence is checked independently and historical non-summed pickup remains untouched',()=>{
 const second={...draft,secondClient:'BETA',secondCity:'NOLA'};
 const rates=[{client:'ACME SRL',city:'NAPOLI',cents:5000}];
 const result=collectOperationalChecks(second,{companyRatesLoaded:true,companyRates:rates});
 assert.deepEqual(result.checks.filter(row=>row.code==='tariff_missing').map(row=>row.field),['secondFareCents']);
 assert.equal(collectOperationalChecks({...second,sumPickupFares:false},{companyRatesLoaded:true,
  companyRates:rates}).checks.some(row=>row.field==='secondFareCents'),false);
});

test('possible duplicate compares the entire container and complete route without truncating descriptions',()=>{
 const prefix='BILICO '+ 'A'.repeat(50),saved={...draft,id:'saved',container:prefix+' DEPOSITO ALFA'};
 assert.equal(collectOperationalChecks({...draft,container:prefix+' DEPOSITO BETA'},{trips:[saved]})
  .checks.some(row=>row.code==='trip_possible_duplicate'),false);
 const match=collectOperationalChecks({...saved,id:'new'},{trips:[saved]});
 assert.equal(match.checks.find(row=>row.code==='trip_possible_duplicate').confidence,'possible');
 assert.deepEqual(match.checks.find(row=>row.code==='trip_possible_duplicate').tripIds,['new','saved']);
 assert.equal(collectOperationalChecks(saved,{trips:[saved],editingId:'saved'}).checks.length,0);
 assert.equal(collectOperationalChecks({...saved,secondClient:'ALTRO',secondCity:'NOLA'},
  {trips:[saved]}).checks.some(row=>row.code==='trip_possible_duplicate'),false);
});

test('frequency and recency include both pickups, count one journey per route and never invent a date',()=>{
 const trips=[
  {id:'a',date:'2026-11-01',client:'ALFA',city:'NAPOLI',secondClient:'BETA',secondCity:'NOLA'},
  {id:'b',date:'2026-11-10',client:'ALFA',city:'NAPOLI',secondClient:'ALFA',secondCity:'NAPOLI'},
  {id:'c',date:'2026-11-11',client:'GAMMA',city:'ACERRA',secondClient:'BETA',secondCity:'NOLA'},
  {id:'d',date:'unknown',client:'UNCONFIGURED',city:'LOCALITÀ NUOVA'}
 ];
 const before=structuredClone(trips),result=buildOperationalSuggestions({trips});
 assert.equal(result.scope,'both-pickups');
 assert.deepEqual(result.customers.slice(0,2).map(row=>[row.name,row.usageCount,row.lastUsedDate]),
  [['BETA',2,'2026-11-11'],['ALFA',2,'2026-11-10']]);
 assert.equal(result.cities.find(row=>row.city==='NAPOLI').usageCount,2);
 assert.equal(result.customers.find(row=>row.name==='UNCONFIGURED').lastUsedDate,null);
 assert.ok(result.customers.every(row=>row.confidence==='suggestion'));
 assert.deepEqual(trips,before);
});
