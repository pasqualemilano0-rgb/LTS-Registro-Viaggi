import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('documenti/admin-documents.mjs');
const html=read('amministratore/buste-paga/index.html');
const css=read('documenti/documents.css');
const edge=read('supabase/functions/lts-payroll/index.ts');

const start=admin.indexOf('const MAX_PDF_SIZE=8388608;');
const end=admin.indexOf('function view(name){',start);
assert.ok(start>=0&&end>start,'validation helpers must be isolated and testable');
const {validateUploadFields,uploadedFilesLabel}=new Function(
 admin.slice(start,end)+'\nreturn {validateUploadFields,uploadedFilesLabel};'
)();

const pdf=(name='prova.pdf',size=2000,type='application/pdf')=>({name,size,type});
const valid=()=>({recipient:{documents_enabled:true},category:'cedolino',
 year:'2026',month:'11',label:'Cedolino novembre 2026',files:[pdf()]});

test('complete valid PDF upload selection passes independent validation',()=>{
 assert.equal(validateUploadFields(valid()),null);
 assert.equal(validateUploadFields({...valid(),files:[pdf(),pdf('prova2.pdf')]}),null);
 assert.match(uploadedFilesLabel([pdf()]),/PDF selezionato: prova\.pdf/);
 assert.match(uploadedFilesLabel([pdf(),pdf('prova2.pdf')]),/2 PDF selezionati/);
 assert.equal(uploadedFilesLabel([]),'Nessun PDF selezionato.');
});

test('missing month, description or PDF always returns an actionable field error',()=>{
 const month=validateUploadFields({...valid(),month:''});
 assert.equal(month.field,'month');
 assert.match(month.message,/Seleziona il mese/);
 const label=validateUploadFields({...valid(),label:''});
 assert.equal(label.field,'label');
 assert.match(label.message,/descrizione/);
 const file=validateUploadFields({...valid(),files:[]});
 assert.equal(file.field,'files');
 assert.match(file.message,/Scegli file/);
});

test('invalid years and invalid or oversize files cannot be submitted',()=>{
 for(const year of ['','1999','2101','no','2026.5']){
  assert.equal(validateUploadFields({...valid(),year}).field,'year');
 }
 for(const invalidFile of [
  pdf('prova.txt'),pdf('prova.pdf',9),
  pdf('prova.pdf',8388609),pdf('prova.pdf',2048,'text/plain')
 ]){
  assert.equal(validateUploadFields({...valid(),files:[invalidFile]}).field,'files');
 }
});

test('selection for another driver or unavailable pilot is refused on client and server',()=>{
 for(const recipient of [null,{documents_enabled:false}]){
  const result=validateUploadFields({...valid(),recipient});
  assert.equal(result.field,'driver');
  assert.match(result.message,/MILANO PASQUALE/);
 }
 assert.match(edge,/if\(driverId!==await requireMilanoPasqualeRecipient\(db\)\)/);
 assert.match(edge,/if\(doc\.driver_id!==await requireMilanoPasqualeRecipient\(db\)\)/);
 assert.match(edge,/await requireAdminMfa\(api\.db,match\[1\],userId\)/);
});

test('CU and other documents do not require a payslip month',()=>{
 assert.equal(validateUploadFields({...valid(),category:'cu',month:''}),null);
 assert.equal(validateUploadFields({...valid(),category:'altri',month:''}),null);
 assert.equal(validateUploadFields({...valid(),category:'unrecognized'}).field,'category');
});

test('Android page submits to custom validation and shows feedback next to the button',()=>{
 assert.match(html,/<body class="admin-payroll-page">/);
 assert.match(html,/<form id="upload-form" class="form-grid" novalidate>/);
 assert.match(html,/id="upload-feedback"[^>]*role="status"[^>]*aria-live="polite"/);
 assert.match(html,/id="file-selection"[^>]*aria-live="polite"/);
 assert.match(html,/id="upload-submit"/);
 assert.match(html,/admin-documents\.mjs\?v=20261123-unified-login-v1/);
 assert.match(html,/documents\.css\?v=20261123-admin-upload-feedback-v1/);
 assert.match(css,/\.admin-payroll-page \.admin-upload-feedback\{/);
 assert.match(css,/\.admin-payroll-page \.admin-upload-feedback\.error\{/);
 assert.match(admin,/const issue=validateUploadFields\(values\)/);
 assert.match(admin,/uploadFeedback\(issue\.message,'error'\)/);
 assert.match(admin,/uploadFeedback\('Caricamento PDF '\+\(success\+1\)/);
 assert.match(admin,/await api\.upload\(file,\{driverId:selected\.id/);
 assert.match(admin,/uploadFeedback\(success\+' '\+\(success===1\?'PDF caricato':'PDF caricati'\)\+' in bozza/);
 assert.match(admin,/if\(success\)\{[\s\S]*?await refreshDocs\(\)/);
 assert.doesNotMatch(html,/<script[^>]+src="https?:/);
});

test('description suggestions respect manual input and upload never auto-publishes',()=>{
 assert.match(admin,/let descriptionEdited=false/);
 assert.match(admin,/if\(descriptionEdited\)return/);
 assert.match(admin,/category==='cedolino'/);
 assert.match(admin,/\$\('label'\)\.addEventListener\('input',\(\)=>\{descriptionEdited=true;\}\)/);
 assert.doesNotMatch(admin.slice(admin.indexOf("$('upload-form').addEventListener('submit'")),
  /await api\.publish\(/);
});
