import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,createTrip,validateState,validateTrip} from '../shared/domain.mjs';
import {reportRows} from '../shared/pdf.mjs';

const base={date:'2026-11-13',client:'ALFA',city:'SALERNO',container:'MSCU1234567',services:[],note:'NOTA PRIVATA',adminNote:'ATTESA 2 ORE'};
test('trip notes and administrative notes persist independently',()=>{
 const state=emptyState();
 const trip=createTrip(base,state);
 assert.equal(trip.note,'NOTA PRIVATA');
 assert.equal(trip.adminNote,'ATTESA 2 ORE');
 const saved=validateState({...state,profile:{firstName:'Mario',lastName:'Rossi'},trips:[trip]});
 assert.equal(saved.trips[0].adminNote,'ATTESA 2 ORE');
 const updated=createTrip({...base,note:'NOTA MODIFICATA'},saved,saved.trips[0]);
 assert.equal(updated.adminNote,'ATTESA 2 ORE');
 assert.equal(updated.note,'NOTA MODIFICATA');
 assert.deepEqual(reportRows({...saved,trips:[updated]},'2026-11')[0].length,5);
 assert(!reportRows({...saved,trips:[updated]},'2026-11').flat().join(' ').includes('ATTESA'));
});
test('invalid administrative note is rejected without changing private notes',()=>{
 assert.equal(validateTrip({...base,adminNote:7}).valid,false);
 assert.equal(validateTrip({...base,adminNote:'X'.repeat(2001)}).valid,false);
 assert.equal(validateTrip({...base,adminNote:''}).value.note,'NOTA PRIVATA');
});
