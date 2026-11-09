import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalPersonalCustomer} from '../shared/customer-site-matches.mjs';
import {emptyState,createTrip,validateState,tripAmounts} from '../shared/domain.mjs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const original={id:'personal-1',name:'ACCIAI SPECIALI TERNI',city:'TERNI',
 address:'VIA INDUSTRIALE 10',vat:'',phone:''};

test('customer directory view-only decorations do not cause a false edit/delete conflict',()=>{
 const archive=[original];
 const decorated={...original,directorySource:'personal'};
 const selected=canonicalPersonalCustomer(archive,decorated);
 assert.notEqual(JSON.stringify(decorated),JSON.stringify(original),
  'original bug: compare selected directory copy with an archived customer');
 assert.strictEqual(selected,original,'must reuse exact owned archive record');
 assert.equal(JSON.stringify(selected),JSON.stringify(archive[0]));
 assert.deepEqual(decorated,{...original,directorySource:'personal'},
  'lookup must never mutate a card or the persistent record');
});

test('reject company/shared cards, deleted records and name-only matches',()=>{
 const archive=[original];
 assert.equal(canonicalPersonalCustomer(archive,{...original,directorySource:'shared'}),null);
 assert.equal(canonicalPersonalCustomer(archive,{id:'deleted',name:original.name}),null);
 assert.equal(canonicalPersonalCustomer(archive,{name:original.name}),null);
 assert.equal(canonicalPersonalCustomer(archive,null),null);
 assert.equal(canonicalPersonalCustomer([],original),null);
 assert.equal(canonicalPersonalCustomer(archive,{...original,id:1}),null);
});

test('legitimate remote changes are still detected after canonical selection',()=>{
 const archive=[original];
 const baseline=JSON.stringify(canonicalPersonalCustomer(archive,{...original,directorySource:'personal'}));
 const updated={...original,phone:'+390123456789'};
 assert.notEqual(baseline,JSON.stringify(canonicalPersonalCustomer([updated],original)));
 assert.equal(canonicalPersonalCustomer([],original),null);
});

test('deleting a personal customer never removes previously saved trips or their fare snapshots',()=>{
 const initial=validateState({...emptyState(),customers:[original]});
 const journey=createTrip({date:'2026-11-09',client:original.name,city:original.city,
  container:'MSDU1234567',services:[]},initial);
 journey.fareCents=8500;
 const state=validateState({...initial,trips:[journey]});
 const next=validateState({...state,customers:state.customers.filter(c=>c.id!==original.id),
  tariffs:state.tariffs.filter(t=>t.customerId!==original.id&&t.client!==original.name)});
 assert.equal(next.customers.length,0);
 assert.equal(next.trips.length,1);
 assert.deepEqual(next.trips[0],state.trips[0]);
 assert.equal(tripAmounts(next.trips[0]).totalCents,8500);
});

test('actual customer dialog uses canonical archive snapshot and retains optimistic concurrency guard',()=>{
 const start=app.indexOf('function customerDialog(');
 const end=app.indexOf('function openProfile(',start);
 assert.ok(start>0&&end>start);
 const code=app.slice(start,end);
 assert.match(code,/const original=canonicalPersonalCustomer\(state[.]customers,customer\)/);
 assert.match(code,/if\(!original\)[\s\S]*?return;/);
 assert.match(code,/customer=original;\s*}\s*const expectedCustomer=editorVersion\(customer\)/);
 assert.match(code,/requireCurrentEditor\(expectedCustomer,state[.]customers[.]find\(current=>current[.]id===customer[.]id\),'Il cliente'\)/);
 assert.match(code,/state[.]customers[.]filter\(c=>c[.]id!==customer[.]id\)/);
 assert.match(code,/state[.]tariffs[.]filter\(t=>t[.]customerId!==customer[.]id&&t[.]client!==customer[.]name\)/);
 assert.doesNotMatch(code,/state[.]trips[.]filter/);
});
