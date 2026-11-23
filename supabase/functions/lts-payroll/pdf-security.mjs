/**
 * Conservative structural admission gate for private LTS payroll PDF uploads.
 *
 * Defense in depth, NOT a malware scanner or a complete PDF parser. PDF names
 * in compressed object streams are not inspected here. Keep files as private
 * drafts until an approved scanning/sanitization pipeline exists.
 *
 * Side-effect free: importable by Node regression tests and Deno Edge runtime.
 */
const MAX_PDF_BYTES=8388608;
const ACTIVE_PDF_NAMES=new Set([
 'JavaScript','JS','OpenAction','AA','Launch','EmbeddedFile','EmbeddedFiles',
 'RichMedia','XFA','AcroForm','SubmitForm','GoToR'
]);
const BAD='Documento PDF non valido o con contenuti attivi non consentiti.';

export function validatePayrollPdf(data){
 if(!ArrayBuffer.isView(data)||data.BYTES_PER_ELEMENT!==1||
    data.byteLength<48||data.byteLength>MAX_PDF_BYTES)
  return {ok:false,reason:BAD};

 // Decode Latin-1 only for PDF syntax inspection; never execute or render bytes.
 const raw=new TextDecoder('latin1').decode(data);
 if(!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(raw.slice(0,16)))
  return {ok:false,reason:BAD};
 if(!/\b\d+\s+\d+\s+obj\b/.test(raw))
  return {ok:false,reason:BAD};

 // Require the FINAL trailer and an in-bounds cross-reference pointer.
 // This rejects common truncated PDFs and polyglot files with an appended tail.
 const tail=raw.slice(-4096);
 const match=/\bstartxref\s+(\d+)\s+%%EOF[ \t\r\n\f]*$/.exec(tail);
 if(!match)return {ok:false,reason:BAD};
 const offset=Number(match[1]);
 if(!Number.isSafeInteger(offset)||offset<9||offset>=data.byteLength)
  return {ok:false,reason:BAD};
 const target=raw.slice(offset,offset+64);
 if(!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(target))
  return {ok:false,reason:BAD};

 // PDF names can encode ASCII with #xx (for example /J#61vaScript).
 // Recognize these spellings instead of testing only literal /JavaScript.
 const names=raw.match(/\/[^\x00-\x20()<>\[\]{}\/%]+/g)||[];
 for(const token of names){
  const decoded=token.slice(1).replace(/#([\da-fA-F]{2})/g,(_,hex)=>
   String.fromCharCode(Number.parseInt(hex,16)));
  if(ACTIVE_PDF_NAMES.has(decoded)||decoded==='Encrypt')
   return {ok:false,reason:BAD};
 }
 return {ok:true};
}
