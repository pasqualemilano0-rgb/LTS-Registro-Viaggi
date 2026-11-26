import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,createTrip,validateState,validateTrip} from '../shared/domain.mjs';
import {reportRows,generateMonthlyPdf} from '../shared/pdf.mjs';
import {tripDraftHasWork,restoreTripEditorSnapshot,TRIP_DRAFT_VERSION} from '../shared/trip-editor-safety.mjs';

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

test('administrative-only draft survives recovery',()=>{
 const draft={...base,container:'',client:'',city:'',note:'',adminNote:'NOTA SOLO ADMIN'};
 assert.equal(tripDraftHasWork(draft,null,'2026-11-13'),true);
 const restored=restoreTripEditorSnapshot({version:TRIP_DRAFT_VERSION,draft},[]);
 assert.equal(restored.draft.adminNote,'NOTA SOLO ADMIN');
});

test('monthly PDF places only administrative notes after trip rows',()=>{
 const calls=[];
 class FakePdf {
  constructor(){this.pages=1;this.lastAutoTable=null;}
  setProperties(){} setFont(){} setFontSize(){} setTextColor(){} setDrawColor(){}
  setLineWidth(){} line(){} addImage(){} setPage(){}
  splitTextToSize(text){return [String(text)];}
  getImageProperties(){return {width:100,height:40};}
  getNumberOfPages(){return this.pages;}
  text(){} output(){return new Blob(['pdf']);}
  autoTable(options){
   calls.push(options);
   this.lastAutoTable={finalY:options.startY+25};
  }
 }
 const state={...emptyState(),profile:{firstName:'Mario',lastName:'Rossi'},
  trips:[createTrip(base,emptyState()),createTrip({...base,id:'second',date:'2026-11-14',note:'SEGRETO',adminNote:''},emptyState())]};
 const result=generateMonthlyPdf({state,month:'2026-11',logoDataUrl:'data:image/png;base64,AA==',jsPDF:FakePdf});
 assert.equal(result.tripCount,2);
 assert.equal(calls.length,2);
 assert.equal(calls[0].body.length,2);
 assert.equal(calls[0].theme,'plain');
 assert.equal(calls[0].headStyles.fillColor,'#e4f4f9');
 assert.equal(calls[0].alternateRowStyles.fillColor,'#f3f6f8');
 assert.equal(calls[1].body.length,1);
 assert.match(calls[1].head[0][0],/NOTE PER L'AMMINISTRAZIONE/);
 assert.equal(calls[1].body[0][0],'');
 assert.equal(typeof calls[1].didDrawCell,'function');
 const drawn=[];
 const originalText=FakePdf.prototype.text;
 FakePdf.prototype.text=function(value){drawn.push(value);};
 generateMonthlyPdf({state,month:'2026-11',logoDataUrl:'data:image/png;base64,AA==',jsPDF:FakePdf});
 const card={row:{index:0},column:{index:0},section:'body',cell:{x:11,y:70}};
 calls[3].didDrawCell(card);
 FakePdf.prototype.text=originalText;
 assert(drawn.some(value=>String(value).includes('13/11/2026 · MSCU')));
 assert(drawn.some(value=>String(value).includes('Nota: ATTESA 2 ORE')));
 assert.equal(calls[1].columnStyles[0].cellWidth,94);
 assert.equal(calls[1].columnStyles[1].cellWidth,94);
 assert(!JSON.stringify(calls).includes('NOTA PRIVATA'));
 assert(!JSON.stringify(calls).includes('SEGRETO'));
 assert.ok(calls[1].startY>calls[0].startY);
});

import {readFileSync} from 'node:fs';
import {mergeStates,SyncConflictError} from '../shared/sync-merge.mjs';

test('independent edits retain both kinds of notes and conflicting edits are blocked',()=>{
 const initial=emptyState();
 const trip=createTrip(base,initial);
 const original=validateState({...initial,trips:[trip]});
 const local=structuredClone(original),remote=structuredClone(original);
 local.trips[0].note='NOTA PRIVATA MODIFICATA';
 remote.trips[0].adminNote='NOTA ADMIN MODIFICATA';
 const merged=mergeStates(original,local,remote);
 assert.equal(merged.trips[0].note,'NOTA PRIVATA MODIFICATA');
 assert.equal(merged.trips[0].adminNote,'NOTA ADMIN MODIFICATA');
 remote.trips[0].note='CONFLITTO';
 assert.throws(()=>mergeStates(original,local,remote),SyncConflictError);
});
test('driver clearing either note requires confirmation and returned values are checked',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.ok(app.includes("if(previousNotes?.note?.trim()&&!checked.value.note.trim())warnings.push"));
 assert.ok(app.includes("if(previousNotes?.adminNote?.trim()&&!checked.value.adminNote.trim())warnings.push"));
 assert.ok(app.includes("(savedTrip.note??'')!==(trip.note??'')"));
 assert.ok(app.includes("(savedTrip.adminNote??'')!==(trip.adminNote??'')"));
 assert.ok(app.includes("if(warnings.length)confirmAction"));
});
test('QA history is transactionally captured and private by default',()=>{
 const sql=readFileSync(new URL('../supabase/qa/trip-note-history.sql',import.meta.url),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON lts_internal.trip_note_history FROM PUBLIC, anon, authenticated, service_role/);
 assert.match(sql,/AFTER INSERT OR UPDATE OR DELETE ON public.lts_account_archives/);
 assert.match(sql,/Existing trip note omitted from archive update/);
 assert.match(sql,/LOCK TABLE public.lts_account_archives IN SHARE ROW EXCLUSIVE MODE/);
 assert.match(sql,/previous_note,current_note/);
});
