import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../documenti/admin-documents.mjs',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const MAX_PDF_SIZE=8388608;'),source.indexOf('function view(name){'));
const start=source.indexOf("$('month').required=true;");
const end=source.indexOf("$('filter-driver').addEventListener('change'",start);
assert.ok(start>0&&end>start,'upload handlers must be located in the real module');
const interactions=source.slice(start,end);
const months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function fixture({driverEnabled=true,failAt=0,allowConfirm=true}={}){
 const els={},calls=[],checks=[],busyEvents=[],snapshot={refreshes:0};
 function element(id){
  if(!els[id])els[id]={
   value:'',files:[],hidden:true,textContent:'',attributes:{},disabled:false,listeners:{},focused:false,
   classList:{toggle(){}},
   addEventListener(event,callback){this.listeners[event]=callback;},
   setAttribute(k,v){this.attributes[k]=v;},
   removeAttribute(k){delete this.attributes[k];},
   focus(){this.focused=true;}
  };
  return els[id];
 }
 for(const id of ['month','category','year','label','driver','files','upload-form','upload-submit',
  'upload-feedback','file-selection','filter-driver','filter-category'])element(id);
 element('category').value='cedolino';element('driver').value='driver-A';
 element('year').value='2026';
 const roster=[{id:'driver-A',name:'Milano Pasquale',documents_enabled:driverEnabled}];
 const api={upload:async(file,options)=>{
  calls.push({file,options});
  if(failAt&&calls.length===failAt)throw Error('Server error');
  return {id:'draft-'+calls.length,state:'draft'};
 }};
 const compiler=new Function('$','roster','months','api','window','snapshot','busyEvents',[
  'let loading=false;',
  'function busy(value){loading=value;busyEvents.push(value);}',
  'function notice(){}',
  'async function refreshDocs(){snapshot.refreshes++;}',
  helpers,interactions,
  'return {get loading(){return loading;}};'
 ].join('\n'));
 const controller=compiler(element,roster,months,api,{confirm:message=>{
  checks.push(message);return allowConfirm;
 }},snapshot,busyEvents);
 const sample=(name='cedolino.pdf')=>({name,size:1280,type:'application/pdf'});
 const trigger=(id,event,...args)=>{
  const fn=element(id).listeners[event];
  assert.equal(typeof fn,'function','handler missing: '+id+'.'+event);
  return fn(...args);
 };
 const submit=()=>trigger('upload-form','submit',{preventDefault(){}});
 return {el:element,trigger,submit,calls,checks,busyEvents,snapshot,controller,sample};
}

test('missing month displays inline error instead of silently blocking the button',async()=>{
 const f=fixture();
 await f.submit();
 assert.equal(f.calls.length,0);
 assert.match(f.el('upload-feedback').textContent,/Seleziona il mese del cedolino/);
 assert.equal(f.el('upload-feedback').hidden,false);
 assert.equal(f.el('month').focused,true);
});

test('valid PDF is uploaded as draft, shown as success and filtered in archive',async()=>{
 const f=fixture();
 f.el('month').value='11';f.trigger('month','change');
 assert.equal(f.el('label').value,'Cedolino Novembre 2026');
 f.el('files').files=[f.sample()];f.trigger('files','change');
 assert.match(f.el('file-selection').textContent,/cedolino\.pdf/);
 await f.submit();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].options.driverId,'driver-A');
 assert.equal(f.calls[0].options.month,'11');
 assert.equal(f.calls[0].options.label,'Cedolino Novembre 2026');
 assert.match(f.el('upload-feedback').textContent,/1 PDF caricati in bozza/);
 assert.equal(f.el('filter-driver').value,'driver-A');
 assert.equal(f.el('filter-category').value,'cedolino');
 assert.equal(f.snapshot.refreshes,1);
 assert.deepEqual(f.busyEvents,[true,false]);
 assert.equal(f.el('upload-form').attributes['aria-busy'],undefined);
 assert.equal(f.controller.loading,false);
});

test('disabled recipient is refused before any upload request',async()=>{
 const f=fixture({driverEnabled:false});
 f.el('month').value='11';f.el('label').value='Cedolino novembre';
 f.el('files').files=[f.sample()];
 await f.submit();
 assert.equal(f.calls.length,0);
 assert.match(f.el('upload-feedback').textContent,/MILANO PASQUALE/);
});

test('network failure appears next to form, not only in page-top notice',async()=>{
 const f=fixture({failAt:1});
 f.el('month').value='11';f.el('label').value='Cedolino novembre';
 f.el('files').files=[f.sample()];
 await f.submit();
 assert.equal(f.calls.length,1);
 assert.match(f.el('upload-feedback').textContent,/controlla l’archivio prima di riprovare/);
 assert.deepEqual(f.busyEvents,[true,false]);
});

test('partial batch failure reports confirmed files and refreshes archive',async()=>{
 const f=fixture({failAt:2});
 f.el('month').value='11';f.el('label').value='Cedolino novembre';
 f.el('files').files=[f.sample('uno.pdf'),f.sample('due.pdf')];
 await f.submit();
 assert.equal(f.calls.length,2);
 assert.match(f.el('upload-feedback').textContent,/1 PDF caricati con conferma/);
 assert.equal(f.snapshot.refreshes,1);
 assert.equal(f.el('filter-driver').value,'driver-A');
 assert.equal(f.el('files').value,'');
});

test('cancelling confirmation does not upload',async()=>{
 const f=fixture({allowConfirm:false});
 f.el('month').value='11';f.el('label').value='Cedolino novembre';
 f.el('files').files=[f.sample()];
 await f.submit();
 assert.equal(f.calls.length,0);
 assert.match(f.el('upload-feedback').textContent,/Caricamento annullato/);
 assert.deepEqual(f.busyEvents,[]);
});

test('manual descriptions survive month and year changes',()=>{
 const f=fixture();
 f.el('label').value='Descrizione personalizzata';f.trigger('label','input');
 f.el('month').value='11';f.trigger('month','change');
 f.el('year').value='2025';f.trigger('year','change');
 assert.equal(f.el('label').value,'Descrizione personalizzata');
});
