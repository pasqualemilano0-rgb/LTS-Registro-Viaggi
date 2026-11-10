import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGISTER_PAGE_SIZE,registerTripCounts,filterRegisterTrips,paginateRegisterTrips,stepRegisterMonth} from '../shared/register-explorer.mjs';
import {buildTripAmountContext,emptyExtraRates,tripAmounts} from '../shared/domain.mjs';

const trip=(id,other={})=>({
 id:String(id),date:'2026-11-09',container:'MSDU123456.7',client:'CAFFÈ ADRIATICO',
 city:'NAPOLI',secondClient:'',secondCity:'',note:'',
 fareCents:7000,secondFareCents:null,sumPickupFares:false,services:[],
 extraCents:emptyExtraRates(),createdAt:'2026-11-09T08:00:00.000Z',updatedAt:'2026-11-09T08:00:00.000Z',
 ...other
});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('text search is accent-insensitive across client, city, notes, services and container',()=>{
 const rows=[trip('1',{city:'MONTE SANT’ANGELO',note:'RITIRO REEFER',services:['adr']}),
  trip('2',{client:'ALTRA AZIENDA',city:'CASERTA',container:'WXYZ567890.1'})];
 assert.deepEqual(filterRegisterTrips(rows,{query:'CAFFE'}).map(x=>x.id),['1']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'sant angelo reefer'}).map(x=>x.id),['1']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'MSDU1234567'}).map(x=>x.id),['1']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'wxyz567890.1'}).map(x=>x.id),['2']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'09/11/2026'}).map(x=>x.id),['1','2']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'2026-11-09'}).map(x=>x.id),['1','2']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'ADR'}).map(x=>x.id),['1']);
 assert.deepEqual(filterRegisterTrips(rows,{query:'non esiste'}),[]);
});

test('four quick filters use the actual fare snapshot and pickup/extra fields',()=>{
 const rows=[trip('one'),trip('no-price',{fareCents:null}),
  trip('second',{secondClient:'BETA',secondCity:'AVELLINO',secondFareCents:2500}),
  trip('extra',{services:['reefer'],extraCents:{...emptyExtraRates(),reefer:1500}})];
 const context=buildTripAmountContext(rows);
 const counts=registerTripCounts(rows,context);
 assert.deepEqual(counts,{all:4,unpriced:1,second:1,extras:1});
 for(const [filter,id] of [['unpriced','no-price'],['second','second'],['extras','extra']]){
  assert.deepEqual(filterRegisterTrips(rows,{filter,amountContext:context}).map(t=>t.id),[id]);
 }
 assert.deepEqual(filterRegisterTrips(rows,{filter:'all',query:'caserta',amountContext:context}),[]);
 assert.throws(()=>filterRegisterTrips(rows,{filter:'delete-all'}),/Filtro/);
});

test('Saturday allowance is still allocated once when the list is filtered',()=>{
 const a=trip('a',{date:'2026-11-07',services:['sabatoTrasferta'],
  extraCents:{...emptyExtraRates(),sabatoTrasferta:1800}});
 const b=trip('b',{date:'2026-11-07',createdAt:'2026-11-07T09:00:00.000Z',services:['sabatoTrasferta'],
  extraCents:{...emptyExtraRates(),sabatoTrasferta:1800}});
 const rows=[a,b],context=buildTripAmountContext(rows);
 assert.equal(tripAmounts(a,context).extraCents+tripAmounts(b,context).extraCents,1800);
 assert.equal(registerTripCounts(rows,context).unpriced,0);
 assert.equal(filterRegisterTrips(rows,{filter:'extras',amountContext:context}).length,2);
 assert.equal(tripAmounts(a,context).extraCents+tripAmounts(b,context).extraCents,1800);
});

test('month navigation handles year boundaries and configured month limits',()=>{
 assert.equal(stepRegisterMonth('2026-12',1),'2027-01');
 assert.equal(stepRegisterMonth('2026-01',-1),'2025-12');
 assert.equal(stepRegisterMonth('1900-01',-1),'1900-01');
 assert.equal(stepRegisterMonth('2199-12',1),'2199-12');
 assert.equal(stepRegisterMonth('2026-11',0),'2026-11');
 assert.throws(()=>stepRegisterMonth('2026-13',1),/Mese/);
 assert.throws(()=>stepRegisterMonth('2026-11',13),/Spostamento/);
});

test('pagination reveals results progressively and never changes original rows',()=>{
 const trips=Array.from({length:1600},(_,i)=>trip('trip-'+i,{container:'CONT'+String(i).padStart(7,'0')}));
 const frozen=trips.slice();const first=paginateRegisterTrips(trips);
 assert.equal(first.visible.length,REGISTER_PAGE_SIZE);
 assert.equal(first.hasMore,true);
 assert.equal(paginateRegisterTrips(trips,48).visible.length,48);
 assert.equal(paginateRegisterTrips(trips,1599).hasMore,true);
 assert.equal(paginateRegisterTrips(trips,1600).hasMore,false);
 assert.equal(paginateRegisterTrips([],48).total,0);
 assert.deepEqual(trips,frozen);
 const filtered=filterRegisterTrips(trips,{query:'cont0000088'});
 assert.equal(filtered.length,1);
 assert.equal(filtered[0].id,'trip-88');
});

test('register UI uses live filtering, undo, narrow rendering, archived PDF scope',()=>{
 const app=read('app.mjs');
 const css=read('app.css');
 const worker=read('sw.js');
 const shell=read('index.html');
 assert.match(app,/function renderRegister\(main\)/);
 assert.match(app,/function updateRegisterList\(\)/);
 assert.match(app,/filterRegisterTrips\(trips,/);
 assert.match(app,/page[.]visible[.]map\(trip=>tripCard/);
 assert.match(app,/registerLimit\+=REGISTER_PAGE_SIZE/);
 assert.match(app,/stepRegisterMonth\(month,-1\)/);
 assert.match(app,/stepRegisterMonth\(month,1\)/);
 assert.match(app,/month=savedDate[.]slice\(0,7\)/);
 assert.match(app,/deleteRegisteredTrip\(trip\)/);
 assert.match(app,/undoLastDeletedTrip\(\)/);
 assert.match(app,/duplicateRegisteredTrip\(trip\)/);
 assert.match(app,/structuredClone\(item[.]trip\)/);
 assert.match(app,/async function persist\(nextState\)/);
 assert.match(app,/PDF include tutti i viaggi del mese/);
 assert.match(css,/register-filter\[aria-pressed=true\]/);
 assert.match(css,/register-month-arrow:focus-visible/);
 assert.match(worker,/shared\/register-explorer[.]mjs/);
 assert.match(shell,/app[.]mjs[?]v=20261110-driver-resume-v1/);
});
