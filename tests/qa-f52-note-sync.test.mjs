import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyState,createTrip,validateState} from '../shared/domain.mjs';
import {mergeStates,SyncConflictError} from '../shared/sync-merge.mjs';
function fixture(){
 const s=emptyState();
 return validateState({...s,trips:[createTrip({id:'42',date:'2026-11-13',client:'QA',city:'QA',container:'MSCU1234567',services:[],note:'private',adminNote:'admin'},s)]});
}
test('F52: omitted notes on legacy side survive a concurrent tariff edit',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.trips[0].id=42;delete local.trips[0].note;delete local.trips[0].adminNote;
 remote.trips[0].fareCents=7500;remote.trips[0].adminNote='new admin';
 const result=mergeStates(base,local,remote);
 assert.equal(result.trips[0].note,'private');assert.equal(result.trips[0].adminNote,'new admin');assert.equal(result.trips[0].fareCents,7500);
 assert.equal(Object.hasOwn(local.trips[0],'note'),false);
});
test('F52: explicit clear remains intentional, and conflicting edits stay blocked',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.trips[0].adminNote='';delete remote.trips[0].adminNote;
 assert.equal(mergeStates(base,local,remote).trips[0].adminNote,'');
 remote.trips[0].adminNote='different';assert.throws(()=>mergeStates(base,local,remote),SyncConflictError);
});
test('F52: omission does not recreate an explicitly deleted journey',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.trips=[];delete remote.trips[0].note;delete remote.trips[0].adminNote;
 assert.equal(mergeStates(base,local,remote).trips.length,0);
});
test('F52: offline queue keeps unknown admin and personal fields omitted until server acknowledgement',()=>{
 const src=readFileSync(new URL('../client-store.mjs',import.meta.url),'utf8');
 const begin=src.indexOf('function unknownNoteIds(record)'),end=src.indexOf('function pendingRecord(',begin);
 assert.ok(begin>=0&&end>begin);
 const box={runtime:{deviceToken:null},structuredClone};
 vm.runInNewContext(src.slice(begin,end)+';globalThis.build=newRequestState;',box);
 const s=fixture(),legacy=structuredClone(s);
 delete legacy.trips[0].note;delete legacy.trips[0].adminNote;
 const normalized=validateState(legacy);
 for(const record of [{baseState:legacy,state:normalized},{state:normalized,unknownNoteIds:['42'],unknownAdminNoteIds:['42']}]){
  const queued=box.build(normalized,record);
  assert.equal(Object.hasOwn(queued.trips[0],'note'),false);
  assert.equal(Object.hasOwn(queued.trips[0],'adminNote'),false);
 }
 const known=structuredClone(s);known.trips[0].note='';known.trips[0].adminNote='';
 assert.equal(box.build(known,{baseState:s,state:known}).trips[0].adminNote,'');
 assert.ok(src.includes('unknownAdminNoteIds: [...unknownAdminNoteIds(local)]'));
});
