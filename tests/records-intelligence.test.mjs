import test from 'node:test';
import assert from 'node:assert/strict';
import {RECORD_FILTERS,assessPersonalCustomer,archiveCustomerMetrics,
 customerMatchesQuickFilter,tripWorklistSummary,archiveMatchesSearch,archivedRestoreStatus}
 from '../amministratore/records-intelligence.mjs';

const personal={id:'c1',name:'ALFA LOGISTICA SRL',city:'NAPOLI',
 address:'VIA INDUSTRIA 12',phone:'+393331234567',vat:'01234567890'};
const shared={name:'Alfa Logistica SRL',city:'Napoli (NA)',
 address:'Via Industria 12',source:'google_maps_link',
 mapsUrl:'https://maps.app.goo.gl/verified'};
const anotherWarehouse={...shared,address:'VIA INDUSTRIA 99',
 mapsUrl:'https://maps.app.goo.gl/another'};

test('exact company/city/street yields shared match without deleting data',()=>{
 const result=assessPersonalCustomer(personal,[shared]);
 assert.equal(result.status,'shared');
 assert.equal(result.exactShared,shared);
 assert.equal(personal.address,'VIA INDUSTRIA 12');
 assert.equal(customerMatchesQuickFilter(personal,'shared',[shared]),true);
});

test('company with another warehouse is only a possible duplicate',()=>{
 const result=assessPersonalCustomer(personal,[anotherWarehouse]);
 assert.equal(result.status,'possible');
 assert.equal(result.exactShared,null);
 assert.equal(customerMatchesQuickFilter(personal,'possible',[anotherWarehouse]),true);
 assert.equal(customerMatchesQuickFilter(personal,'shared',[anotherWarehouse]),false);
});

test('matching company name and city without address is not certified',()=>{
 const missing={...personal,id:'c2',address:''};
 const result=assessPersonalCustomer(missing,[shared]);
 assert.equal(result.status,'possible');
 assert.equal(result.missingAddress,true);
 assert.equal(result.exactShared,null);
});

test('offline or failed shared lookup never claims duplicates are absent',()=>{
 const result=assessPersonalCustomer(personal,null);
 assert.equal(result.sharedChecked,false);
 assert.equal(result.exactShared,null);
 assert.equal(result.possibleDuplicate,null);
 const m=archiveCustomerMetrics([personal],null);
 assert.equal(m.possible,null);
 assert.equal(m.shared,null);
 assert.equal(m.missing,0);
});

test('with a verified shared list all worklist filters operate on real fields',()=>{
 const missing={...personal,id:'c2',name:'BETA',address:''};
 const rows=[personal,missing];
 const metrics=archiveCustomerMetrics(rows,[shared]);
 assert.deepEqual({total:metrics.total,missing:metrics.missing,shared:metrics.shared,
  review:metrics.review},{total:2,missing:1,shared:1,review:1});
 assert.equal(customerMatchesQuickFilter(missing,'missing',[shared]),true);
 assert.equal(customerMatchesQuickFilter(personal,'review',[shared]),false);
 assert.equal(customerMatchesQuickFilter(personal,'all',[shared]),true);
 assert.deepEqual(RECORD_FILTERS.trip.map(x=>x.key),['all','incomplete']);
});

test('ambiguous company rows never become certified automatically',()=>{
 const copies=[shared,{...shared,mapsUrl:'https://maps.app.goo.gl/repeated'}];
 const result=assessPersonalCustomer(personal,copies);
 assert.equal(result.status,'possible');
 assert.equal(result.exactShared,null);
});

test('accent-insensitive search includes VAT, notes, city and container',()=>{
 assert.equal(archiveMatchesSearch(personal,'customer','alfa 01234567890'),true);
 assert.equal(archiveMatchesSearch(personal,'customer','Napoli industriale'),false);
 assert.equal(archiveMatchesSearch({client:'ACETIFICIO',city:'MONTE SANT’ANGELO',
  container:'ABCD1234567',date:'2026-11-07',note:'CARICO REEFER'},'trip','angelo reefer'),true);
});

test('trip quality worklist identifies unpriced transfers and missing extras',()=>{
 const trips=[
  {id:'a',date:'2026-11-01',fareCents:7000,services:[],extraCents:{}},
  {id:'b',date:'2026-11-02',fareCents:null,services:[],extraCents:{}},
  {id:'c',date:'2026-11-03',fareCents:7000,services:['adr'],extraCents:{adr:null}},
  {id:'d',date:'2026-11-04',fareCents:7000,services:['adr'],extraCents:{adr:0}}
 ];
 const result=tripWorklistSummary(trips);
 assert.equal(result.total,4);
 assert.equal(result.incomplete,2);
 assert.deepEqual([...result.incompleteIds].sort(),['b','c']);
});

test('two trips on the same date do not double count Saturday allowance',()=>{
 const trips=[
  {id:'a',date:'2026-11-07',createdAt:'2026-11-07T08:00:00Z',
   fareCents:5000,services:['sabatoTrasferta'],extraCents:{sabatoTrasferta:1000}},
  {id:'b',date:'2026-11-07',createdAt:'2026-11-07T09:00:00Z',
   fareCents:5000,services:['sabatoTrasferta'],extraCents:{sabatoTrasferta:1000}}
 ];
 const metrics=tripWorklistSummary(trips);
 assert.equal(metrics.incomplete,0);
});

test('large company directory remains responsive without quadratic comparisons',()=>{
 const count=12000;
 const shared=Array.from({length:count},(_,i)=>({
  name:'DEPOSITO '+i,city:'NAPOLI',address:'VIA DEL PORTO '+i,
  mapsUrl:'https://maps.example.test/place/'+i
 }));
 const customers=shared.map((site,i)=>({
  id:'client-'+i,name:site.name,city:site.city,address:site.address
 }));
 const start=performance.now();
 const totals=archiveCustomerMetrics(customers,shared);
 assert.equal(totals.total,count);
 assert.equal(totals.shared,count);
 assert.equal(totals.possible,0);
 assert.equal(totals.review,0);
 // Reuse the same shared snapshot on each search/filter pass.
 const matches=customers.filter(row=>customerMatchesQuickFilter(row,'shared',shared));
 assert.equal(matches.length,count);
 const elapsed=performance.now()-start;
 console.log('Customer archive worklist '+count+'x'+count+
  ': '+Math.round(elapsed)+' ms');
 assert.ok(elapsed<5000,
  'Large read-only customer worklists should not freeze phones: '+Math.round(elapsed)+' ms');
});


test('audit restoration: deletion becomes non-actionable immediately after restore',()=>{
 const removed={id:'c1',action:'delete',category:'customer',recordId:'c1',afterRevision:4};
 const restored={id:'r1',action:'restore',category:'customer',recordId:'c1',afterRevision:5};
 const before={customers:[],trips:[],tariffs:[]};
 const after={...before,customers:[{id:'c1',name:'CLIENTE ALFA'}]};
 assert.deepEqual(archivedRestoreStatus(removed,[removed],before),
  {eligible:true,label:'Ripristina'});
 assert.deepEqual(archivedRestoreStatus(removed,[restored,removed],after),
  {eligible:false,label:'Già ripristinato'});
 assert.equal(archivedRestoreStatus(removed,[removed],after).eligible,false,
  'Never restore over an existing customer, even if audit is stale');
});

test('audit restoration: old deletes cannot be replayed after re-deletion',()=>{
 const first={id:'d1',action:'delete',category:'trip',recordId:'t1',afterRevision:3};
 const restore={id:'r1',action:'restore',category:'trip',recordId:'t1',afterRevision:4};
 const latest={id:'d2',action:'delete',category:'trip',recordId:'t1',afterRevision:5};
 const state={customers:[],trips:[],tariffs:[]};
 assert.equal(archivedRestoreStatus(first,[latest,restore,first],state).eligible,false);
 assert.equal(archivedRestoreStatus(latest,[latest,restore,first],state).eligible,true);
 assert.equal(archivedRestoreStatus({action:'delete',category:'other',recordId:'x'},[],state).eligible,false);
 assert.equal(archivedRestoreStatus({action:'delete',category:'tariff',recordId:'r1',afterRevision:9},[],null).eligible,false);
});
