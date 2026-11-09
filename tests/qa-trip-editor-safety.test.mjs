import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tripDraftHasWork,possibleTripDuplicate,restoreTripEditorSnapshot,TRIP_DRAFT_VERSION} from '../shared/trip-editor-safety.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base={date:'2026-11-09',container:'',client:'',city:'',secondClient:'',secondCity:'',
 services:[],note:'',second:false,noteOpen:false,servicesOpen:false};

test('only meaningful edits trigger unsaved-work protections',()=>{
 assert.equal(tripDraftHasWork(base,null,'2026-11-09'),false);
 assert.equal(tripDraftHasWork({...base,noteOpen:true},null,'2026-11-09'),false);
 assert.equal(tripDraftHasWork({...base,client:' ACME '},null,'2026-11-09'),true);
 assert.equal(tripDraftHasWork({...base,date:'2026-11-08'},null,'2026-11-09'),true);
 assert.equal(tripDraftHasWork(base,'editing-1','2026-11-09'),true);
 assert.equal(tripDraftHasWork({...base,services:['preOrario']},null,'2026-11-09'),true);
 assert.equal(tripDraftHasWork({...base,second:true},null,'2026-11-09'),true);
 // After a successful save, same-day convenience must not cause a false prompt.
 assert.equal(tripDraftHasWork({...base,date:'2026-11-08'},null,'2026-11-08'),false);
});
test('warn on a same-day same-client same-route container, not legitimate different trips',()=>{
 const saved={id:'old-1',date:'2026-11-09',container:'MSDU1234567',client:'AZIENDA BETA',city:'NAPOLI'};
 const form={...base,date:saved.date,container:'MSDU123456.7',client:' azienda beta ',city:'napoli'};
 assert.equal(possibleTripDuplicate([saved],form).id,'old-1');
 assert.equal(possibleTripDuplicate([saved],form,'old-1'),null);
 assert.equal(possibleTripDuplicate([saved],{...form,date:'2026-11-10'}),null);
 assert.equal(possibleTripDuplicate([saved],{...form,city:'CASERTA'}),null);
 assert.equal(possibleTripDuplicate([saved],{...form,container:'MSDU1234568'}),null);
});
test('recover only whitelisted data; never inherit identity, prices or timestamps',()=>{
 const entry={version:TRIP_DRAFT_VERSION,draft:{...base,client:'TEST',note:'a'.repeat(2050),
  services:['preOrario','unknown','preOrario'],fareCents:99999,id:'unsafe',createdAt:'yesterday'},
  editingId:null,editingBaseline:null};
 const restored=restoreTripEditorSnapshot(entry,[]);
 assert.equal(restored.draft.note.length,2000);
 assert.deepEqual(restored.draft.services,['preOrario']);
 assert.equal(Object.hasOwn(restored.draft,'fareCents'),false);
 assert.equal(Object.hasOwn(restored.draft,'id'),false);
 assert.equal(restored.editingId,null);
 assert.equal(restoreTripEditorSnapshot({...entry,version:17},[]),null);
 assert.equal(restoreTripEditorSnapshot({...entry,draft:null},[]),null);
});
test('deleted edit is recovered as a new draft, existing edit keeps conflict fingerprint',()=>{
 const editing={version:TRIP_DRAFT_VERSION,draft:{...base,client:'TEST'},editingId:'trip-1',editingBaseline:'original'};
 const deleted=restoreTripEditorSnapshot(editing,[]);
 assert.equal(deleted.removedEdit,true);
 assert.equal(deleted.editingId,null);
 assert.equal(deleted.draft.client,'TEST');
 const existing=restoreTripEditorSnapshot(editing,[{id:'trip-1'}]);
 assert.equal(existing.removedEdit,false);
 assert.equal(existing.editingId,'trip-1');
 assert.equal(existing.editingBaseline,'original');
});
test('driver wiring: account-scoped IndexedDB scratchpad, visible sync and guarded navigation',()=>{
 const store=read('client-store.mjs'),app=read('app.mjs'),worker=read('sw.js');
 assert.match(store,/TRIP_EDITOR_DRAFT_PREFIX='trip-editor-v1:'/);
 assert.match(store,/accountOwner!==owner/);
 assert.match(store,/!account[.]isVerified\(\)/);
 assert.match(store,/transaction=db[.]transaction\('meta'/);
 assert.match(store,/export function readTripEditorDraft\(\)/);
 assert.match(store,/export function clearTripEditorDraft\(\)/);
 assert.match(app,/await recoverEditorScratchpad\(\)/);
 assert.match(app,/await store[.]clearTripEditorDraft\(\)/);
 assert.match(app,/function navigate\(next,\{keepDraft=false\}=\{\}\)/);
 assert.match(app,/if\(warnings[.]length\)confirmAction/);
 assert.match(app,/possibleTripDuplicate\(state[.]trips,draft,editingId\)/);
 assert.match(app,/missingEstimateTariffs/);
 assert.match(app,/Viaggio salvato sul dispositivo/);
 assert.match(worker,/shared\/trip-editor-safety[.]mjs/);
 assert.doesNotMatch(app,/localStorage[.]setItem\('trip-editor-v1:/);
});
