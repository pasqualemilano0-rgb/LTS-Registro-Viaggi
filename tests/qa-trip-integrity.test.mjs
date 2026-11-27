import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrip,validateTrip,emptyState,emptyExtraRates,tripAmounts,validateState} from '../shared/domain.mjs';
import {restoreTripEditorSnapshot,TRIP_DRAFT_VERSION} from '../shared/trip-editor-safety.mjs';
import {quickTripFromRoute} from '../shared/quick-trip.mjs';

const old={id:'qa-trip',date:'2026-11-24',container:'TEST1234567',client:'ALFA',city:'NAPOLI',
 secondClient:'BETA',secondCity:'CASERTA',services:[],note:'',adminNote:'',fareCents:10000,
 secondFareCents:5000,sumPickupFares:false,extraCents:emptyExtraRates(),
 createdAt:'2026-11-24T09:00:00Z',updatedAt:'2026-11-24T09:00:00Z'};
const state=emptyState();
test('editing a note on a historical one-fare trip never adds the second fare',()=>{
 const draft={...old,note:'NOTA DI TEST'};
 delete draft.sumPickupFares;
 const edited=createTrip(draft,state,old);
 assert.equal(edited.sumPickupFares,false);
 assert.equal(edited.secondFareCents,5000);
 assert.equal(tripAmounts(edited).totalCents,10000);
 assert.equal(tripAmounts(validateState({...state,trips:[edited]}).trips[0]).totalCents,10000);
});
test('explicit choice of one or two company fares, no arbitrary amounts',()=>{
 for(const [mode,total] of [[false,10000],[true,15000]]){
  const edited=createTrip({...old,sumPickupFares:mode},state,old);
  assert.equal(edited.sumPickupFares,mode);
  assert.equal(tripAmounts(edited).totalCents,total);
 }
 assert.equal(createTrip({...old,secondClient:'',secondCity:'',sumPickupFares:true},state,old).sumPickupFares,false);
 assert.equal(validateTrip({...old,sumPickupFares:'false'}).valid,false);
});
test('enabled second pickup requires both fields, even if both are blank',()=>{
 for(const [secondClient,secondCity] of [['',''],['BETA',''],['','CASERTA']]){
  const input={...old,second:true,secondClient,secondCity};
  assert.equal(validateTrip(input).valid,false);
  assert.throws(()=>createTrip(input,state,old));
 }
 assert.equal(validateTrip({...old,second:true}).valid,true);
 assert.equal(validateTrip({...old,second:false,secondClient:'',secondCity:''}).valid,true);
});
test('old and new draft recovery preserves one-fare mode, route repetition preserves choice',()=>{
 const draft={...old,second:true};
 delete draft.sumPickupFares;
 const entry={version:TRIP_DRAFT_VERSION,draft,editingId:old.id,editingBaseline:'old'};
 assert.equal(restoreTripEditorSnapshot(entry,[old]).draft.sumPickupFares,false);
 assert.equal(restoreTripEditorSnapshot({...entry,draft:{...draft,sumPickupFares:true}},[old]).draft.sumPickupFares,true);
 assert.equal(quickTripFromRoute(old,old.date).sumPickupFares,false);
 assert.equal(quickTripFromRoute({...old,sumPickupFares:true},old.date).sumPickupFares,true);
});
test('driver editor persists fare choice and uses the same mode for estimate and warning',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/id:'pickup-fare-mode'/);
 assert.match(app,/Una tariffa · due clienti/);
 assert.match(app,/Due tariffe · due clienti/);
 assert.match(app,/sumPickupFares:Boolean\(draft.second&&fareMode\?\.value==='two'\)/);
 assert.match(app,/sumPickupFares:Boolean\(draft.second&&draft.secondCity&&draft.sumPickupFares\)/);
 assert.match(app,/draft.second&&draft.sumPickupFares&&candidate.secondFareCents===null/);
 assert.match(app,/const trip=D.createTrip\(draft,\{\.\.\.state,tariffs:\[\]\},existing\)/);
});
