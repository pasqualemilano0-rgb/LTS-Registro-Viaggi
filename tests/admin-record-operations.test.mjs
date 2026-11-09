import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,emptyExtraRates,validateState} from '../shared/domain.mjs';
import {applyAdminRecordEdit,linkedCustomerTripCount} from '../shared/admin-record-operations.mjs';
const now='2026-11-07T08:00:00.000Z';
const make=()=>{
 const s=emptyState();
 s.customers=[{id:'c1',name:'ACME',city:'NAPOLI',address:'VIA ROMA 1',phone:'',vat:''}];
 s.tariffs=[{id:'r1',customerId:'c1',client:'ACME',city:'NAPOLI',cents:7500}];
 s.trips=[{id:'t1',date:'2026-11-01',client:'ACME',city:'NAPOLI',
  container:'ABCD1234567',secondClient:'',secondCity:'',note:'NOTA ORIGINALE',
  services:[],fareCents:5000,secondFareCents:null,sumPickupFares:false,
  extraCents:emptyExtraRates(),createdAt:'2026-11-01T07:00:00Z',updatedAt:'2026-11-01T07:00:00Z'}];
 return validateState(s);
};
test('admin trip edit preserves the original price snapshot and create date',()=>{
 const original=make();
 const {state,before,after}=applyAdminRecordEdit(original,{
  action:'update',category:'trip',id:'t1',patch:{note:'Nota revisionata',container:'EFGH1234567'}
 },now);
 assert.equal(after.note,'NOTA REVISIONATA');
 assert.equal(after.fareCents,5000);
 assert.equal(after.createdAt,original.trips[0].createdAt);
 assert.equal(after.updatedAt,now);
 assert.equal(before.note,'NOTA ORIGINALE');
 assert.equal(original.trips[0].note,'NOTA ORIGINALE');
 assert.equal(state.trips.length,1);
});
test('admin can set exact trip fare and second pickup without touching another record',()=>{
 const s=make();
 const {state}=applyAdminRecordEdit(s,{action:'update',category:'trip',id:'t1',
  patch:{secondClient:'BETA',secondCity:'AVELLINO',sumPickupFares:true,
   secondFareCents:2500,fareCents:8000}},now);
 assert.equal(state.trips[0].secondFareCents,2500);
 assert.equal(state.trips[0].sumPickupFares,true);
 assert.equal(s.trips[0].fareCents,5000);
});
test('deleting a personal client detaches legacy tariffs but keeps journeys unchanged',()=>{
 const s=make();
 const {state,before,after}=applyAdminRecordEdit(s,{action:'delete',category:'customer',id:'c1'},now);
 assert.equal(before.name,'ACME');
 assert.equal(after,null);
 assert.equal(state.customers.length,0);
 assert.equal(state.tariffs[0].customerId,null);
 assert.equal(state.tariffs[0].cents,7500);
 assert.equal(state.trips[0].fareCents,5000);
 assert.equal(s.customers.length,1);
});
test('changing client name updates its linked legacy tariff without renaming historical trips',()=>{
 const {state}=applyAdminRecordEdit(make(),{action:'update',category:'customer',id:'c1',
  patch:{name:'ACME NUOVA',address:'VIA DEL PORTO'}},now);
 assert.equal(state.customers[0].name,'ACME NUOVA');
 assert.equal(state.tariffs[0].client,'ACME NUOVA');
 assert.equal(state.trips[0].client,'ACME');
});
test('administrator can restore a deleted trip from a prior audit entry',()=>{
 const first=applyAdminRecordEdit(make(),{action:'delete',category:'trip',id:'t1'},now);
 assert.equal(first.state.trips.length,0);
 const restored=applyAdminRecordEdit(first.state,{action:'restore',category:'trip',id:'t1',
  restoreRecord:first.before},now);
 assert.equal(restored.state.trips.length,1);
 assert.equal(restored.state.trips[0].fareCents,5000);
 assert.deepEqual(restored.state.trips[0],first.before);
});
test('legacy tariff rate is independent from company-wide tariff list',()=>{
 const s=make();
 const {state}=applyAdminRecordEdit(s,{action:'update',category:'tariff',id:'r1',
  patch:{cents:9900}},now);
 assert.equal(state.tariffs[0].cents,9900);
 assert.equal(state.trips[0].fareCents,5000);
 assert.equal(s.tariffs[0].cents,7500);
});
test('extra service rate can be edited independently',()=>{
 const {state}=applyAdminRecordEdit(make(),{action:'update',category:'extra',
  id:'reefer',patch:{cents:3400}},now);
 assert.equal(state.extraRates.reefer,3400);
});
test('a new trip can be entered by admin with a known fare snapshot',()=>{
 const {state}=applyAdminRecordEdit(make(),{action:'create',category:'trip',id:'t2',
  patch:{date:'2026-11-07',client:'BETA',city:'BARI',container:'EFGH9876543',
  note:'INSERITO DA ADMIN',services:[],fareCents:15000}},now);
 assert.equal(state.trips.length,2);
 assert.equal(state.trips.find(x=>x.id==='t2').fareCents,15000);
});
test('unknown edits and duplicate ID are rejected, never silently merged',()=>{
 assert.throws(()=>applyAdminRecordEdit(make(),{action:'update',category:'trip',
  id:'t1',patch:{createdAt:'2000-01-01T00:00:00Z'}}),/non modificabile/);
 assert.throws(()=>applyAdminRecordEdit(make(),{action:'create',category:'trip',
  id:'t1',patch:{date:'2026-11-07'}}),/già presente/);
 assert.throws(()=>applyAdminRecordEdit(make(),{action:'update',category:'trip',
  id:'nonexistent',patch:{note:'TEST'}}),/non trovato/);
 assert.throws(()=>applyAdminRecordEdit(make(),{action:'update',category:'trip',
  id:'t1',patch:{fareCents:-1}}),/centesimi/);
});


test('opt-in updates only trips with exact original name and city, preserving fares and other fields',()=>{
 const state=make();
 state.trips.push({...structuredClone(state.trips[0]),id:'t2',city:'SALERNO',fareCents:7500});
 state.trips.push({...structuredClone(state.trips[0]),id:'t3',client:'ALTRO',city:'MILANO',
   secondClient:'ACME',secondCity:'NAPOLI',fareCents:3500,secondFareCents:9000});
 state.trips.push({...structuredClone(state.trips[0]),id:'t4',client:'ACME',city:'NAPOLI',
   secondClient:'ALTRO',secondCity:'ROMA',note:'VIAGGIO SEPARATO'});
 const original=validateState(state);
 assert.equal(linkedCustomerTripCount(original,original.customers[0]),3);
 const {state:next,affectedTrips}=applyAdminRecordEdit(original,{
  action:'update',category:'customer',id:'c1',
  updateLinkedTrips:true,patch:{name:'ACME NUOVA',city:'CASERTA',address:'VIA NUOVA'}
 },now);
 assert.equal(affectedTrips,3);
 assert.equal(next.customers[0].name,'ACME NUOVA');
 assert.equal(next.trips[0].client,'ACME NUOVA');
 assert.equal(next.trips[0].city,'CASERTA');
 assert.equal(next.trips[0].fareCents,5000);
 assert.equal(next.trips[0].container,original.trips[0].container);
 assert.equal(next.trips[0].date,original.trips[0].date);
 assert.equal(next.trips[0].createdAt,original.trips[0].createdAt);
 assert.equal(next.trips[1].client,'ACME');
 assert.equal(next.trips[1].city,'SALERNO');
 assert.equal(next.trips[1].updatedAt,original.trips[1].updatedAt);
 assert.equal(next.trips[2].client,'ALTRO');
 assert.equal(next.trips[2].secondClient,'ACME NUOVA');
 assert.equal(next.trips[2].secondCity,'CASERTA');
 assert.equal(next.trips[2].secondFareCents,9000);
 assert.equal(next.trips[3].note,'VIAGGIO SEPARATO');
 assert.equal(original.trips[0].client,'ACME');
});
test('without explicit confirmation customer edit leaves every historical trip unchanged',()=>{
 const current=make();
 const updated=applyAdminRecordEdit(current,{
  action:'update',category:'customer',id:'c1',
  patch:{name:'ACME NUOVA',city:'CASERTA'}},now);
 assert.equal(updated.affectedTrips,0);
 assert.deepEqual(updated.state.trips,current.trips);
});
test('opt-in cannot be supplied for other edit categories or malformed flags',()=>{
 const current=make();
 assert.throws(()=>applyAdminRecordEdit(current,{action:'update',category:'trip',id:'t1',
  patch:{note:'TEST'},updateLinkedTrips:true},now),/non consentito/);
 assert.throws(()=>applyAdminRecordEdit(current,{action:'update',category:'customer',id:'c1',
  patch:{name:'TEST'},updateLinkedTrips:'true'},now),/non consentito/);
 assert.equal(linkedCustomerTripCount(current,{name:'ACME',city:''}),0);
});


test('company rename with an already existing same-city rate preserves the old rate without deleting or repricing',()=>{
 const state=make();
 state.tariffs.push({id:'r-company',customerId:null,client:'DE NIGRIS',city:'NAPOLI',cents:11200});
 const before=validateState(state);
 const {state:updated,preservedLegacyTariffs,affectedTrips}=applyAdminRecordEdit(before,{
  action:'update',category:'customer',id:'c1',updateLinkedTrips:true,
  patch:{name:'DE NIGRIS',city:'CAIVANO',address:'VIA NAZIONALE'}
 },now);
 assert.equal(preservedLegacyTariffs,1);
 assert.equal(affectedTrips,1);
 assert.equal(updated.customers[0].name,'DE NIGRIS');
 assert.equal(updated.tariffs.length,2,'No rate should disappear');
 const old=updated.tariffs.find(x=>x.id==='r1');
 const company=updated.tariffs.find(x=>x.id==='r-company');
 assert.deepEqual(old,{id:'r1',customerId:null,client:'ACME',city:'NAPOLI',cents:7500},
  'Conflicting rate is retained as a detached historic record');
 assert.deepEqual(company,{id:'r-company',customerId:null,client:'DE NIGRIS',city:'NAPOLI',cents:11200});
 assert.equal(updated.trips[0].client,'DE NIGRIS');
 assert.equal(updated.trips[0].fareCents,5000,'Previously recorded trip price is never recalculated');
 assert.equal(before.trips[0].client,'ACME','Input snapshot remains untouched');
});
test('without tariff collision the same customer rate follows the new name with unchanged amount',()=>{
 const result=applyAdminRecordEdit(make(),{action:'update',category:'customer',id:'c1',
  patch:{name:'NUOVO CLIENTE',city:'CASERTA'}},now);
 assert.equal(result.preservedLegacyTariffs,0);
 assert.equal(result.state.tariffs[0].client,'NUOVO CLIENTE');
 assert.equal(result.state.tariffs[0].customerId,'c1');
 assert.equal(result.state.tariffs[0].cents,7500);
});
