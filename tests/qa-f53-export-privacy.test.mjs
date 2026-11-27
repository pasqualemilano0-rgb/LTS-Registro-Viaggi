import test from 'node:test';
import assert from 'node:assert/strict';
import {makePdf,makeXlsx} from '../amministratore/report-export.mjs';

function fixture(){
 return {month:'2026-11',range:{fromDate:'2026-11-01',toDate:'2026-11-30'},
 selection:{driverId:null},summary:{trips:1,drivers:1,totalCents:7500,missingTariffCount:0},
 records:[{date:'2026-11-26',driverName:'QA TEST',container:'QA-123',client:'=1+1',city:'SALERNO',
 amountCents:7500,note:'PRIVATE_SENTINEL',adminNote:'ADMIN_SENTINEL'}],monthly:[],alerts:[]};
}
test('F53 company PDF excludes both note kinds even if injected into record',()=>{
 const data=fixture(),before=structuredClone(data);
 const pdf=Buffer.from(makePdf(data)).toString('ascii');
 assert.ok(pdf.startsWith('%PDF-1.4'));
 assert.ok(pdf.endsWith('%%EOF'));
 assert.ok(pdf.includes('QA-123'));
 assert.ok(!pdf.includes('PRIVATE_SENTINEL'));
 assert.ok(!pdf.includes('ADMIN_SENTINEL'));
 assert.deepEqual(data,before);
});
test('F53 company XLSX excludes both note kinds and stores formula-like text as text',()=>{
 const data=fixture(),before=structuredClone(data);
 const zip=Buffer.from(makeXlsx(data));
 const contents=zip.toString('utf8');
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.ok(contents.includes('QA-123'));
 assert.ok(!contents.includes('PRIVATE_SENTINEL'));
 assert.ok(!contents.includes('ADMIN_SENTINEL'));
 assert.match(contents,/<c[^>]*t="inlineStr"><is><t[^>]*>=1\+1<\/t>/);
 assert.doesNotMatch(contents,/<f(?:\s|>)/);
 assert.deepEqual(data,before);
});
