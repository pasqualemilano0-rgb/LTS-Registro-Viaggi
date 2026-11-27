import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveOmittedNotes,integrateOmittedNoteProtection} from '../supabase/qa/preserve-omitted-notes.mjs';
test('legacy archive omission preserves both notes without mutation',()=>{
 const prior={trips:[{id:'a',note:'private synthetic',adminNote:'admin synthetic'}]};
 const input={trips:[{id:'a',fareCents:10},{id:'b',note:'new'}]};
 assert.deepEqual(preserveOmittedNotes(input,prior).trips,[{id:'a',fareCents:10,note:'private synthetic',adminNote:'admin synthetic'},{id:'b',note:'new'}]);
 assert.equal(Object.hasOwn(input.trips[0],'note'),false);
});
test('explicit clear, invalid values and new trips are not disguised as omission',()=>{
 const prior={trips:[{id:'a',note:'private',adminNote:'admin'}]};
 assert.deepEqual(preserveOmittedNotes({trips:[{id:'a',note:'',adminNote:null}]},prior).trips,[{id:'a',note:'',adminNote:null}]);
 assert.deepEqual(preserveOmittedNotes({trips:[]},prior),{trips:[]});
});
test('edge integration preserves prior lookup, receipt and revision checks',()=>{
 const src='import { readNoteHistory } from "./note-history-handler.mjs";\n  const checked=checkedState(body.state);\n  const receipt=await requestReceipt(body.requestId,body.baseRevision,checked);\n  const prior=await currentRecord(admin,account.id);\n  if((prior?.revision??0)!==body.baseRevision)throw {status:409};';
 const out=integrateOmittedNoteProtection(src);
 assert.ok(out.indexOf('const prior=')<out.indexOf('const checked='));
 assert.ok(out.includes('checkedState(preserveOmittedNotes(body.state,prior?.payload))'));
 assert.ok(out.includes('requestReceipt(body.requestId,body.baseRevision,checked)'));
 assert.ok(out.includes('if((prior?.revision??0)!==body.baseRevision)throw {status:409};'));
 assert.throws(()=>integrateOmittedNoteProtection(out));
});
