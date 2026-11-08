import test from 'node:test';
import assert from 'node:assert/strict';
import {makeXlsx,makePdf} from '../amministratore/report-export.mjs';
const sample={
 month:'2026-11',range:{fromDate:'2026-11-01',toDate:'2026-11-30'},
 selection:{driverId:'11111111-1111-4111-8111-111111111111'},
 summary:{trips:2,drivers:1,totalCents:25000,missingTariffCount:1},
 drivers:[{id:'11111111-1111-4111-8111-111111111111',name:'Mario Rossi'}],
 monthly:Array.from({length:12},(_,i)=>({month:'2025-12',trips:i+1,totalCents:(i+1)*1000})),
 alerts:[{type:'tariff',severity:'warning',driverName:'Mario Rossi',date:'2026-11-03',
  detail:'Tariffa non completa'}],
 records:[
 {date:'2026-11-03',driverName:'Mario Rossi',container:'ABCD1234567',client:'=HYPERLINK("evil")',
  city:'Napoli',amountCents:10000,missingTariff:true},
 {date:'2026-11-04',driverName:'Mario Rossi',container:'WXYZ1234567',
  client:'CLIENTE & SALERNO <QA>',city:'Salerno',amountCents:15000,missingTariff:false}
 ]
};
function zipNames(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),names=[];
 let pos=0;
 while(pos+30<bytes.length&&view.getUint32(pos,true)===0x04034b50){
  const length=view.getUint16(pos+26,true),extra=view.getUint16(pos+28,true);
  const size=view.getUint32(pos+18,true);
  const name=new TextDecoder().decode(bytes.subarray(pos+30,pos+30+length));
  names.push({name,body:new TextDecoder().decode(bytes.subarray(pos+30+length+extra,pos+30+length+extra+size))});
  pos+=30+length+extra+size;
 }
 return names;
}
test('Excel XLSX contains four real worksheets and escaped untrusted content',()=>{
 const bytes=makeXlsx(sample);
 assert(bytes instanceof Uint8Array);
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const files=zipNames(bytes);
 assert.equal(files.length,9);
 assert(files.some(x=>x.name==='xl/styles.xml'));
 assert(files.find(x=>x.name==='xl/styles.xml').body.includes('applyNumberFormat'));
 assert(files.find(x=>x.name==='xl/worksheets/sheet2.xml').body.includes('autoFilter ref="A1:G3"'));
 assert(files.some(x=>x.name==='[Content_Types].xml'));
 assert(files.some(x=>x.name==='xl/worksheets/sheet1.xml'));
 const trips=files.find(x=>x.name==='xl/worksheets/sheet2.xml').body;
 assert(trips.includes('&lt;QA&gt;'));
 assert(trips.includes('&amp; SALERNO'));
 assert(trips.includes('=HYPERLINK(&quot;evil&quot;)'));
 assert(!trips.includes('<f>'),'User content never becomes Excel formulas');
 assert(trips.includes('<v>100</v>')&&trips.includes('<v>150</v>'));
 const workbook=files.find(x=>x.name==='xl/workbook.xml').body;
 assert(workbook.includes('name="Anomalie"'));
});
test('PDF output has a complete cross-reference and all records with real amount',()=>{
 const pdf=new TextDecoder().decode(makePdf(sample));
 assert(pdf.startsWith('%PDF-1.4'));
 assert(pdf.includes('xref\n0 '));
 assert(pdf.includes('startxref'));
 assert(pdf.includes('Rossi'));
 assert(pdf.includes('250.00'));
 assert(pdf.includes('CLIENTE & SALERNO'),'PDF includes customer names in the authorized report');
 assert(pdf.includes('%%EOF'));
 const objects=[...pdf.matchAll(/\d+ 0 obj\n/g)].length;
 const count=Number(/xref\n0 (\d+)/.exec(pdf)?.[1]);
 assert.equal(objects+1,count);
 const start=Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
 assert.equal(pdf.slice(start,start+4),'xref');
});
test('Export rejects invalid or oversized sensitive records',()=>{
 assert.throws(()=>makeXlsx({...sample,records:[{amountCents:-1}]}),/valido/);
 assert.throws(()=>makePdf({...sample,records:Array.from({length:2501},()=>sample.records[0])}),/2.500/);
});


test('large synthetic PDF and Excel exports retain every journey and correct pagination',()=>{
 const count=1800;
 const records=Array.from({length:count},(_,i)=>({
  date:'2026-11-08',driverName:'Autista QA',container:'TEST'+String(i).padStart(7,'0'),
  client:'CLIENTE DEMO',city:'NAPOLI',amountCents:1200+(i%5)*100,
  missingTariff:false
 }));
 const totalCents=records.reduce((sum,item)=>sum+item.amountCents,0);
 const data={...sample,records,
  summary:{...sample.summary,trips:count,totalCents,missingTariffCount:0}};
 const xlsx=makeXlsx(data),entries=zipNames(xlsx);
 const sheet=entries.find(x=>x.name==='xl/worksheets/sheet2.xml')?.body;
 assert.ok(sheet,'Sheet Viaggi missing from large export');
 assert.equal([...sheet.matchAll(/<row r="/g)].length,count+1);
 assert.match(sheet,new RegExp('autoFilter ref="A1:G'+(count+1)+'"'));
 assert.ok(xlsx.byteLength>100000,'Expected a real multi-page XLSX');
 const pdf=new TextDecoder().decode(makePdf(data));
 const pages=[...pdf.matchAll(/\/Type \/Page \/Parent/g)].length;
 assert.ok(pages>30,'Long report must be paginated, not truncated');
 const journeyDates=[...pdf.matchAll(/\(2026-11-08\)/g)].length;
 assert.equal(journeyDates,count,'PDF lost some records');
 const objects=[...pdf.matchAll(/\d+ 0 obj\n/g)].length;
 const listed=Number(/xref\n0 (\d+)/.exec(pdf)?.[1]);
 assert.equal(objects+1,listed,'PDF cross-reference count mismatch');
 const offset=Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
 assert.equal(pdf.slice(offset,offset+4),'xref','PDF table offset wrong');
 console.log('PASS long exports: '+count+' trips, '+pages+' PDF pages, '+xlsx.byteLength+' XLSX bytes');
});
