/** Offline synthetic PDF-upload boundary checks; no credentials or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePayrollPdf} from '../supabase/functions/lts-payroll/pdf-security.mjs';

function samplePdf(extra='',version='1.7',lineEnd='\n'){
 const header='%PDF-'+version+lineEnd;
 const obj='1 0 obj'+lineEnd+'<< /Type /Catalog '+extra+' >>'+lineEnd+'endobj'+lineEnd;
 const pointer=Buffer.byteLength(header+obj,'latin1');
 const xref='xref'+lineEnd+'0 2'+lineEnd+'0000000000 65535 f '+lineEnd+
  '0000000009 00000 n '+lineEnd+'trailer'+lineEnd+
  '<< /Root 1 0 R /Size 2 >>'+lineEnd+
  'startxref'+lineEnd+pointer+lineEnd+'%%EOF'+lineEnd;
 return Buffer.from(header+obj+xref,'latin1');
}

test('bounded classic PDF with valid cross-reference pointer is admitted',()=>{
 for(const v of ['1.3','1.4','1.7','2.0']){
  assert.deepEqual(validatePayrollPdf(samplePdf('',v)),{ok:true},v);
 }
 assert.deepEqual(validatePayrollPdf(samplePdf('','1.7','\r\n')),{ok:true});
});

test('truncated, prepended, appended and malformed PDF containers are rejected',()=>{
 const valid=samplePdf();
 const variants=[
  new Uint8Array(),
  new Uint8Array(50),
  Buffer.from('<!--html-->\n'+valid.toString('latin1'),'latin1'),
  Buffer.from(valid.toString('latin1').replace('%%EOF\n',''),'latin1'),
  Buffer.concat([valid,Buffer.from('<script>alert(1)</script>')]),
  Buffer.from(valid.toString('latin1').replace(/startxref\s+\d+/, 'startxref\n9999999'),'latin1'),
  Buffer.from(valid.toString('latin1').replace('xref\n','xrefx\n'),'latin1'),
  Buffer.from(valid.toString('latin1').replace('%PDF-1.7','%PDF-9.9'),'latin1'),
 ];
 for(const [i,variant] of variants.entries())
  assert.equal(validatePayrollPdf(variant).ok,false,'invalid sample '+i);
});

test('PDF action entries and embedded content are conservatively denied',()=>{
 const forbidden=[
  '/JavaScript','/JS','/J#53','/J#61vaScript','/OpenAction','/Open#41ction',
  '/AA','/Launch','/EmbeddedFile','/EmbeddedFiles','/RichMedia',
  '/XFA','/AcroForm','/SubmitForm','/GoToR','/Encrypt'
 ];
 for(const token of forbidden)
  assert.equal(validatePayrollPdf(samplePdf(token)).ok,false,token);
});

test('a simulated xref stream remains accepted when pointer targets its object',()=>{
 const header='%PDF-1.7\n';
 const at=Buffer.byteLength(header,'latin1');
 const stream='1 0 obj\n<< /Type /XRef /Size 2 >>\nstream\nabc\nendstream\nendobj\n';
 const data=Buffer.from(header+stream+'startxref\n'+at+'\n%%EOF\n','latin1');
 assert.equal(validatePayrollPdf(data).ok,true);
});

test('upload rejects bad PDF before Storage and safeguards unrelated authorizations',()=>{
 const src=readFileSync(new URL('../supabase/functions/lts-payroll/index.ts',import.meta.url),'utf8');
 const body=src.slice(src.indexOf('async function upload('),src.indexOf('async function publish('));
 const read=body.indexOf('await file.arrayBuffer()');
 const check=body.indexOf('validatePayrollPdf(buffer)');
 const store=body.indexOf('.storage.from(BUCKET)');
 assert.ok(read>0&&check>read&&store>check,'inspect bytes before private Storage');
 assert.match(body,/if\(driverId!==await requireMilanoPasqualeRecipient\(db\)\)/);
 assert.match(src,/await checkLtsSession\(api.db,match\[1\],userId\)/);
 assert.match(src,/await requireAdminMfa\(/);
 assert.match(src,/const PAYROLL_PILOT_LIST_ONLY=true/);
});

test('unexpected exceptions map to generic 503 rather than leaking internal messages',()=>{
 const src=readFileSync(new URL('../supabase/functions/lts-payroll/index.ts',import.meta.url),'utf8');
 assert.match(src,/const controlled=e\?\.status===status && typeof e\?\.message==='string'/);
 assert.match(src,/controlled\?e.message:messages\[status\]/);
});
