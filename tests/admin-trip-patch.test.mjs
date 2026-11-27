import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAdminTripPatch,snapshotAdminTripForm} from '../amministratore/admin-trip-patch.mjs';
import {toCents} from '../shared/domain.mjs';
const price=value=>String(value??'').trim()?toCents(String(value)):null;
const baseline=()=>({
 fields:{date:'2026-11-27',client:'CLIENTE A',city:'ROMA',container:'ABCD1234567',
 secondClient:'',secondCity:'',adminNote:'',fareCents:'10,00',secondFareCents:''},
 sumPickupFares:false,
 services:[{key:'reefer',checked:true,rate:'20,00',disabled:true},
 {key:'preOrario',checked:false,rate:'0,00',disabled:false}]
});
test('customer-only edit never submits an unchanged empty or existing administrative note',()=>{
 for(const note of ['', 'NOTA SINTETICA']){
  const old=baseline();old.fields.adminNote=note;
  const next=structuredClone(old);next.fields.client='CLIENTE B';
  assert.deepEqual(buildAdminTripPatch(next,old,price),{client:'CLIENTE B'});
 }
});
test('explicit note edit or clearing is sent, private note is never sent',()=>{
 const old=baseline();old.fields.adminNote='NOTA SINTETICA';
 const next=structuredClone(old);next.fields.adminNote='';next.fields.note='PRIVATE';
 assert.deepEqual(buildAdminTripPatch(next,old,price),{adminNote:''});
 next.fields.adminNote='NUOVA NOTA';
 assert.deepEqual(buildAdminTripPatch(next,old,price),{adminNote:'NUOVA NOTA'});
});
test('no-op, revert and equivalent monetary formatting omit unchanged fields',()=>{
 const old=baseline();const next=structuredClone(old);
 next.fields.fareCents='10';
 assert.deepEqual(buildAdminTripPatch(next,old,price),{});
});
test('only edited rate and service selection are sent; legacy service stays selected',()=>{
 const old=baseline();const next=structuredClone(old);
 next.services[1].checked=true;next.services[1].rate='5,00';
 assert.deepEqual(buildAdminTripPatch(next,old,price),{services:['reefer','preOrario'],extraCents:{preOrario:500}});
});
test('new trips still send complete editable fields',()=>{
 const next=baseline();next.services.shift();
 const patch=buildAdminTripPatch(next,null,price);
 assert.equal(patch.client,'CLIENTE A');assert.equal(patch.adminNote,'');
 assert.equal(patch.fareCents,1000);assert.deepEqual(patch.services,[]);
 assert.deepEqual(patch.extraCents,{preOrario:0});
});
test('form snapshot is independent of future edits',()=>{
 const draft=baseline();const controls=Object.fromEntries(Object.entries(draft.fields).map(([k,value])=>[k,{value}]));
 controls.sumPickupFares={checked:false};
 const boxes=draft.services.map(s=>({key:s.key,box:{checked:s.checked,disabled:s.disabled},rate:{value:s.rate}}));
 const snap=snapshotAdminTripForm(k=>controls[k],boxes);
 controls.client.value='CLIENTE B';boxes[1].rate.value='5,00';
 assert.deepEqual(buildAdminTripPatch(snapshotAdminTripForm(k=>controls[k],boxes),snap,price),{client:'CLIENTE B',extraCents:{preOrario:500}});
});
test('administrative note control remains optional in the protected editor',()=>{
 const editor=readFileSync(new URL('../amministratore/driver-records.mjs',import.meta.url),'utf8');
 assert.match(editor,/field\(form,'Nota per l’amministrazione','adminNote',values[.]adminNote\|\|'',\{kind:'textarea',maxLength:2000\}\)/);
 assert.doesNotMatch(editor,/adminNote[^\n]{0,100}required:true/);
});
