/**
 * LTS V3 self-contained PDF and XLSX downloads.
 * No external CDN, no data sent to third parties, no HTML injections, no formulas.
 * Export only an already authenticated and confirmed company report.
 */
const encoder=new TextEncoder();
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 .replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const latin=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/€/g,'EUR').replace(/[—–]/g,'-').replace(/[^\x20-\x7e]/g,'?');
const cents=n=>Number.isSafeInteger(n)&&n>=0?(n/100).toFixed(2):'0.00';
const safeName=data=>'LTS_report_'+data.month+(data.selection?.driverId?'-autista':'-azienda');
function valid(data){
 if(!data||typeof data!=='object'||!Array.isArray(data.records)||!data.summary||
  !/^\d{4}-\d{2}$/.test(data.month)||data.records.length>10000)
  throw Error('Report da esportare non valido.');
 for(const item of data.records)if(!Number.isSafeInteger(item.amountCents)||item.amountCents<0)
  throw Error('Importo del report non valido.');
 return data;
}
function sheetXml(rows){
 const cols='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
 const cell=(value,r,c)=>{
  const address=cols[c]+r;
  if(typeof value==='number'&&Number.isFinite(value))
   return '<c r="'+address+'" t="n"><v>'+value+'</v></c>';
  return '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+html(value)+'</t></is></c>';
 };
 const body=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>cell(v,i+1,j)).join('')+'</row>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>'+body+'</sheetData></worksheet>';
}
const le16=(a,n)=>{a.push(n&255,(n>>>8)&255);};
const le32=(a,n)=>{a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);};
function crc32(bytes){
 let crc=0xFFFFFFFF;
 for(const x of bytes){crc^=x;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
 return (crc^0xFFFFFFFF)>>>0;
}
function zip(entries){
 const chunks=[],directory=[];let offset=0;
 for(const [name,raw] of entries){
  const filename=encoder.encode(name),bytes=encoder.encode(raw),crc=crc32(bytes);
  const header=[];le32(header,0x04034b50);le16(header,20);le16(header,0x0800);
  le16(header,0);le16(header,0);le16(header,0);le32(header,crc);
  le32(header,bytes.length);le32(header,bytes.length);le16(header,filename.length);le16(header,0);
  chunks.push(Uint8Array.from(header),filename,bytes);
  const dir=[];le32(dir,0x02014b50);le16(dir,20);le16(dir,20);le16(dir,0x0800);
  le16(dir,0);le16(dir,0);le16(dir,0);le32(dir,crc);
  le32(dir,bytes.length);le32(dir,bytes.length);le16(dir,filename.length);
  le16(dir,0);le16(dir,0);le16(dir,0);le16(dir,0);le32(dir,0);le32(dir,offset);
  directory.push(Uint8Array.from(dir),filename);
  offset+=header.length+filename.length+bytes.length;
 }
 const dirSize=directory.reduce((n,b)=>n+b.length,0);
 const eocd=[];le32(eocd,0x06054b50);le16(eocd,0);le16(eocd,0);
 le16(eocd,entries.length);le16(eocd,entries.length);le32(eocd,dirSize);le32(eocd,offset);le16(eocd,0);
 const parts=[...chunks,...directory,Uint8Array.from(eocd)],length=offset+dirSize+eocd.length;
 const output=new Uint8Array(length);let at=0;
 for(const part of parts){output.set(part,at);at+=part.length;}
 return output;
}
export function makeXlsx(data){
 valid(data);
 const overview=[
  ['LTS - REPORT AZIENDALE',''],
  ['Periodo di analisi',data.range.fromDate+' / '+data.range.toDate],
  ['Mese di riferimento',data.month],
  ['Autista',data.drivers?.[0]?.name&&data.selection?.driverId?data.drivers[0].name:'Tutti gli autisti'],
  ['Viaggi registrati',data.summary.trips],
  ['Autisti con viaggi',data.summary.drivers],
  ['Valore trasferte registrate (EUR)',Number(cents(data.summary.totalCents))],
  ['Tariffe incomplete',data.summary.missingTariffCount],
  ['',''],
  ['AVVISO','Importi registrati, non fatturato, utile netto o stipendio. Solo viaggi sincronizzati.']
 ];
 const records=[['Data','Autista','Container','Cliente principale','Localita principale','Valore registrato (EUR)','Tariffa mancante'],...data.records.map(t=>[
  t.date,t.driverName,t.container,t.client,t.city,Number(cents(t.amountCents)),t.missingTariff?'SI':'NO'
 ])];
 const trend=[['Mese','Viaggi','Importo registrato (EUR)'],...(data.monthly||[]).map(m=>[m.month,m.trips,Number(cents(m.totalCents))])];
 const alerts=[['Tipo','Gravita','Autista','Data','Dettaglio'],...(data.alerts||[]).map(x=>[
  x.type,x.severity,x.driverName||'',x.date||'',x.detail||''
 ])];
 const workbook='<?xml version="1.0" encoding="UTF-8"?>'+
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<sheets>'+['Riepilogo','Viaggi','Storico','Anomalie'].map((x,i)=>
   '<sheet name="'+x+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
 const rels='<?xml version="1.0" encoding="UTF-8"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  [1,2,3,4].map(i=>'<Relationship Id="rId'+i+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+i+'.xml"/>').join('')+
  '</Relationships>';
 const ct='<?xml version="1.0" encoding="UTF-8"?>'+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
  '<Default Extension="xml" ContentType="application/xml"/>'+
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
  [1,2,3,4].map(i=>'<Override PartName="/xl/worksheets/sheet'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
 const root='<?xml version="1.0" encoding="UTF-8"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 return zip([['[Content_Types].xml',ct],['_rels/.rels',root],['xl/workbook.xml',workbook],
  ['xl/_rels/workbook.xml.rels',rels],['xl/worksheets/sheet1.xml',sheetXml(overview)],
  ['xl/worksheets/sheet2.xml',sheetXml(records)],['xl/worksheets/sheet3.xml',sheetXml(trend)],
  ['xl/worksheets/sheet4.xml',sheetXml(alerts)]]);
}
// Self-contained A4 landscape? Portrait report with a compact 12-month chart and
// a paginated table, using PDF 1.4 and built-in Helvetica (no fonts embedded).
const esc=s=>latin(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const trim=(s,max=65)=>{const t=latin(s);return t.length>max?t.slice(0,max-3)+'...':t;};
function textAt(x,y,size,value){return 'BT /F1 '+size+' Tf '+x+' '+y+' Td ('+esc(value)+') Tj ET\n';}
function rect(x,y,w,h){return x+' '+y+' '+w+' '+h+' re f\n';}
export function makePdf(data){
 valid(data);
 if(data.records.length>2500)throw Error('Per il PDF seleziona un periodo con massimo 2.500 viaggi.');
 const pages=[];let ops=[],y=775,rowCount=0;
 function pageStart(){
  ops=['0.08 0.22 0.29 rg\n',textAt(41,800,19,'LTS - REPORT AZIENDALE'),
   textAt(41,781,10,'Analisi trasferte registrate | Periodo '+data.range.fromDate+' - '+data.range.toDate),
   '0.09 0.49 0.55 rg\n',rect(40,764,515,3),'0.1 0.18 0.22 rg\n'];
  y=749;rowCount=0;
 }
 function next(){pages.push(ops.join(''));pageStart();}
 pageStart();
 const selected=data.selection?.driverId?(data.drivers||[]).find(x=>x.id===data.selection.driverId)?.name||'Autista selezionato':'Tutti gli autisti';
 ops.push(textAt(42,y,11,'Autista: '+trim(selected,58)));y-=19;
 ops.push(textAt(42,y,11,'Viaggi: '+data.summary.trips+'  |  Importi registrati: EUR '+cents(data.summary.totalCents)));y-=19;
 ops.push(textAt(42,y,10,'Tariffe incomplete: '+data.summary.missingTariffCount+'  |  Autisti con viaggi: '+data.summary.drivers));y-=30;
 ops.push(textAt(42,y,12,'Andamento ultimi 12 mesi'));y-=15;
 const ms=(data.monthly||[]).slice(-12);const max=Math.max(1,...ms.map(x=>x.trips));
 if(ms.length){
  const width=28,gap=12,x0=54,baseY=y-95;
  ops.push('0.86 0.91 0.93 RG\n');
  for(const [i,m] of ms.entries()){
   const h=Math.max(1,Math.round(m.trips/max*78)),xx=x0+i*(width+gap);
   ops.push('0.06 0.51 0.59 rg\n',rect(xx,baseY,width,h),'0.12 0.24 0.29 rg\n');
   ops.push(textAt(xx,baseY-13,7,m.month.slice(5,7)+'/'+m.month.slice(2,4)));
  }
  y=baseY-30;
 }
 ops.push(textAt(42,y,12,'Dettaglio viaggi sincronizzati'));y-=18;
 ops.push('0.89 0.94 0.95 rg\n',rect(40,y-3,515,17),'0.11 0.24 0.29 rg\n',
  textAt(45,y+2,8,'DATA'),textAt(122,y+2,8,'AUTISTA'),textAt(260,y+2,8,'CONTAINER'),textAt(365,y+2,8,'IMPORTO EUR'));
 y-=22;
 if(!data.records.length){ops.push(textAt(42,y,10,'Nessun viaggio trovato per i filtri selezionati.'));y-=18;}
 for(const item of data.records){
  if(y<66){
   ops.push(textAt(42,34,8,'LTS | Solo trasferte sincronizzate - non utile netto o stipendio'));
   next();
   ops.push(textAt(42,y,11,'Dettaglio viaggi (continua)'));y-=23;
  }
  if(rowCount%2===0){ops.push('0.96 0.98 0.99 rg\n',rect(40,y-5,515,19),'0.1 0.2 0.24 rg\n');}
  ops.push(textAt(45,y,8,item.date),textAt(122,y,8,trim(item.driverName,25)),
   textAt(260,y,8,trim(item.container,16)),textAt(365,y,8,cents(item.amountCents)+(item.missingTariff?' *':'')));
  ops.push(textAt(122,y-11,7,trim((item.client||'')+' / '+(item.city||''),63)));
  y-=27;rowCount++;
 }
 ops.push(textAt(42,34,8,'LTS | Solo trasferte sincronizzate - non utile netto o stipendio'));
 pages.push(ops.join(''));
 // PDF objects and exact byte offsets (ASCII-only content).
 const objects=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const refs=[];
 for(const page of pages){
  const contentId=objects.length+2,pageId=objects.length+1;
  const stream=encoder.encode(page);
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+contentId+' 0 R >>');
  objects.push('<< /Length '+stream.length+' >>\nstream\n'+page+'endstream');
  refs.push(pageId+' 0 R');
 }
 objects[2]='<< /Type /Pages /Kids ['+refs.join(' ')+'] /Count '+refs.length+' >>';
 let file='%PDF-1.4\n%\xD3\xD4\xD5\xD6\n',offsets=[0];
 // All objects only use ASCII content; high-bit binary-comment bytes are permitted.
 for(let i=1;i<objects.length;i++){
  offsets.push(encoder.encode(file).length);
  file+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const pos=encoder.encode(file).length;
 file+='xref\n0 '+objects.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
 'trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+pos+'\n%%EOF';
 return encoder.encode(file);
}
export function saveReport(bytes,mime,filename){
 if(!(bytes instanceof Uint8Array)||bytes.length===0)throw Error('Documento non generato.');
 const blob=new Blob([bytes],{type:mime}),url=URL.createObjectURL(blob);
 try{
  const a=document.createElement('a');
  a.href=url;a.download=filename;a.rel='noopener';document.body.append(a);
  a.click();a.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
export function downloadPdf(data){
 return saveReport(makePdf(data),'application/pdf',safeName(data)+'.pdf');
}
export function downloadXlsx(data){
 return saveReport(makeXlsx(data),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',safeName(data)+'.xlsx');
}
