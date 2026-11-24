import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../documenti/driver-documents.mjs',import.meta.url),'utf8');
function harness(){
 const nodes={content:{hidden:false},refresh:{},more:{hidden:true},year:{value:''},
  documents:{rows:[],attrs:{},replaceChildren(){this.rows=[]},append(...rows){this.rows.push(...rows)},
   setAttribute(key,value){this.attrs[key]=value}}};
 const pending=[],notes=[];
 const account={owner:'account:A',verified:true,role:'driver',isVerified(){return this.verified},
  getRole(){return this.role},getAccountId(){return this.owner}};
 const document={hidden:false};
 const api={documents(filter){return new Promise((resolve,reject)=>pending.push({filter,resolve,reject}));}};
 const start=source.indexOf('async function load(append=false)');
 const end=source.indexOf("for(const button of document.querySelectorAll('[data-category]'))",start);
 const hide=source.slice(source.indexOf('function hideDocuments(){'),source.indexOf('function locked('));
 assert.ok(start>=0&&end>start);
 const h=new Function('$','api','account','document','note','display','emptyCategoryState','payrollConfigured','closePdfPreview',
  "let category='cedolino',offset=0,busy=false,viewGeneration=0,listRequest=0;\n"+hide+source.slice(start,end)+
  "\nreturn {load,hideDocuments,select(value){category=value;return load()},getOffset(){return offset}};")(
   id=>nodes[id],api,account,document,(message,error)=>notes.push({message,error}),doc=>doc,
   ()=>({empty:true}),()=>true,()=>{});
 return {...h,nodes,pending,notes,account,document};
}
const doc=(category='cedolino',year=2026,id='synthetic')=>({id,category,document_year:year,state:'published'});
test('rapid category switch renders only the latest category even if older response arrives last',async()=>{
 const h=harness(),first=h.load(),second=h.select('cu');
 assert.equal(h.pending.length,2);
 h.pending[1].resolve({documents:[doc('cu')]});await second;
 h.pending[0].resolve({documents:[doc()]});await first;
 assert.deepEqual(h.nodes.documents.rows,[doc('cu')]);
 assert.equal(h.nodes.documents.attrs['aria-busy'],'false');
});
test('stale error and finally cannot overwrite a newer loading state',async()=>{
 const h=harness(),first=h.load();
 h.nodes.year.value='2025';const second=h.load();
 h.pending[0].reject(Error('old request'));await first;
 assert.equal(h.nodes.refresh.disabled,true);
 assert.equal(h.nodes.documents.attrs['aria-busy'],'true');
 assert.equal(h.notes.some(n=>n.message==='old request'),false);
 h.pending[1].resolve({documents:[doc('cedolino',2025)]});await second;
 assert.deepEqual(h.nodes.documents.rows,[doc('cedolino',2025)]);
});
test('return after background invalidates old list and permits fresh load',async()=>{
 const h=harness(),first=h.load();
 h.document.hidden=true;h.hideDocuments();
 h.document.hidden=false;h.nodes.content.hidden=false;
 const second=h.load();
 h.pending[1].resolve({documents:[doc('cedolino',2026,'fresh')]});await second;
 h.pending[0].resolve({documents:[doc('cedolino',2026,'old')]});await first;
 assert.equal(h.nodes.documents.rows[0].id,'fresh');
});
test('reject wrong category, year, unpublished row or oversized result before rendering anything',async()=>{
 for(const bad of [doc('cu'),doc('cedolino',2025),{...doc(),state:'draft'},null]){
  const h=harness();h.nodes.year.value='2026';const first=h.load();
  h.pending[0].resolve({documents:[doc(),bad]});await first;
  assert.equal(h.nodes.documents.rows.length,0);
  assert.equal(h.notes.at(-1).error,true);
 }
});
test('pagination is serialized and a filter switch resets offsets',async()=>{
 const h=harness(),first=h.load();
 h.pending[0].resolve({documents:Array.from({length:50},(_,i)=>doc('cedolino',2026,String(i)))});await first;
 assert.equal(h.getOffset(),50);
 const next=h.load(true);await h.load(true);
 assert.equal(h.pending.length,2);assert.equal(h.pending[1].filter.offset,50);
 const fresh=h.select('altri');assert.equal(h.pending[2].filter.offset,0);
 h.pending[1].resolve({documents:[doc()]});await next;
 assert.equal(h.nodes.documents.rows.length,0);
 assert.equal(h.nodes.more.disabled,true);
 h.pending[2].resolve({documents:[doc('altri')]});await fresh;
 assert.equal(h.getOffset(),1);
 assert.deepEqual(h.nodes.documents.rows,[doc('altri')]);
});
test('account identity changes during request never expose the old result',async()=>{
 const h=harness(),first=h.load();h.account.owner='account:B';
 h.pending[0].resolve({documents:[doc()]});await first;
 assert.equal(h.nodes.documents.rows.length,0);
});
