/**
 * Conservative PDF admission gate for private LTS payroll uploads.
 *
 * Defense in depth, NOT a complete PDF parser, sanitizer or malware scanner.
 * Embedded actions in complex encodings can evade a lightweight lexer.
 * Reject compressed object streams (/ObjStm) until inspected by a real parser
 * in an isolated, audited scanning pipeline. File stays a private draft.
 */
const MAX_PDF_BYTES=8388608;
const ACTIVE_PDF_NAMES=new Set([
 'JavaScript','JS','OpenAction','AA','Launch','EmbeddedFile','EmbeddedFiles',
 'EF','Filespec','RichMedia','XFA','SubmitForm','GoToR','ObjStm','Encrypt'
]);
const BAD='Documento PDF non valido o con contenuti attivi non consentiti.';
const isWhite=code=>code===0||code===9||code===10||code===12||code===13||code===32;
const isDelimiter=code=>code===40||code===41||code===60||code===62||
 code===91||code===93||code===123||code===125||code===47||code===37;
const isBoundary=code=>Number.isNaN(code)||isWhite(code)||isDelimiter(code);

function hasUnsafeSyntax(raw){
 let i=0;
 while(i<raw.length){
  const code=raw.charCodeAt(i);
  if(code===37){
   while(i<raw.length&&raw[i]!=='\r'&&raw[i]!=='\n')i++;
   continue;
  }
  if(code===40){
   let depth=1;i++;
   while(i<raw.length&&depth){
    const ch=raw.charCodeAt(i++);
    if(ch===92){i++;continue;}
    if(ch===40)depth++;
    else if(ch===41)depth--;
   }
   if(depth)return true;
   continue;
  }
  if(code===60){
   if(raw[i+1]==='<'){i+=2;continue;}
   const close=raw.indexOf('>',i+1);
   if(close===-1)return true;
   i=close+1;continue;
  }
  if(code===47){
   const start=++i;
   while(i<raw.length&&!isBoundary(raw.charCodeAt(i)))i++;
   const token=raw.slice(start,i).replace(/#([\da-fA-F]{2})/g,(_,hex)=>
    String.fromCharCode(Number.parseInt(hex,16)));
   if(ACTIVE_PDF_NAMES.has(token))return true;
   continue;
  }
  if(raw.startsWith('stream',i)&&isBoundary(raw.charCodeAt(i-1))){
   let start=i+6;
   while(raw[start]===' '||raw[start]==='\t')start++;
   if(raw[start]==='\r')start++;
   if(raw[start]==='\n')start++;
   else if(raw[start-1]!=='\r'){i++;continue;}
   let end=raw.indexOf('endstream',start);
   while(end>=0&&!isBoundary(raw.charCodeAt(end+9)))
    end=raw.indexOf('endstream',end+1);
   if(end===-1)return true;
   i=end+9;continue;
  }
  i++;
 }
 return false;
}

export function validatePayrollPdf(data){
 if(!ArrayBuffer.isView(data)||data.BYTES_PER_ELEMENT!==1||
    data.byteLength<48||data.byteLength>MAX_PDF_BYTES)
  return {ok:false,reason:BAD};
 const raw=new TextDecoder('latin1').decode(data);
 if(!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(raw.slice(0,16)))
  return {ok:false,reason:BAD};
 if(!/\b\d+\s+\d+\s+obj\b/.test(raw))
  return {ok:false,reason:BAD};
 const tail=raw.slice(-4096);
 const match=/\bstartxref\s+(\d+)\s+%%EOF[ \t\r\n\f]*$/.exec(tail);
 if(!match)return {ok:false,reason:BAD};
 const offset=Number(match[1]);
 if(!Number.isSafeInteger(offset)||offset<9||offset>=data.byteLength)
  return {ok:false,reason:BAD};
 const target=raw.slice(offset,offset+64);
 if(!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(target))
  return {ok:false,reason:BAD};
 if(hasUnsafeSyntax(raw))return {ok:false,reason:BAD};
 return {ok:true};
}
