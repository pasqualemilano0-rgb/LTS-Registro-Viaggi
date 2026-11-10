import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rememberPosition,readPosition,clearPosition} from '../amministratore/admin-position.mjs';
import {hasUnsubmittedTariffDraft} from '../amministratore/tariff-draft-guard.mjs';
import {emptyState,createTrip,upsertTariff,upsertExtraRates} from '../shared/domain.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const owner='account:11111111-1111-4111-8111-111111111111';
function memoryStorage(){
 const data=new Map();
 return {getItem:key=>data.get(key)??null,setItem:(k,v)=>data.set(k,String(v)),
  removeItem:key=>data.delete(key)};
}
test('admin restores every real dashboard workspace, including Tariffe and Archivi',()=>{
 const original=globalThis.sessionStorage;
 globalThis.sessionStorage=memoryStorage();
 try{
  const report=read('amministratore/report.mjs');
  for(const view of ['overview','drivers','trips','records','rates','analysis',
    'alerts','exports','security']){
   assert.match(report,new RegExp("\\['"+view+"','"),'View '+view+' should exist');
   assert.equal(rememberPosition(owner,view,25,460,10000),true,view);
   assert.equal(readPosition(owner,11000).view,view);
   assert.equal(readPosition(owner,11000).y,460);
  }
  assert.equal(rememberPosition(owner,'unknown',0,0,10000),false);
  assert.equal(readPosition(owner,10_000+31*60*1000),null,
   'Expired position must not leak across old sessions');
  clearPosition();assert.equal(readPosition(owner),null);
 }finally{globalThis.sessionStorage=original;}
});
function mockDocument(){
 const forms=new Map();
 for(const id of ['company-rates-form','company-manual-form','company-maps-form'])
  forms.set(id,[]);
 let dirty=false;
 return {forms,setDirty:v=>dirty=v,
  document:{
   getElementById:id=>forms.has(id)?{
    querySelectorAll:()=>forms.get(id)
   }:null,
   querySelector:()=>dirty?{}:null
  }
 };
}
const textInput=value=>({type:'text',disabled:false,value});
test('tariff draft detector catches all three forms and edited extras without warning on server values',()=>{
 const m=mockDocument();
 assert.equal(hasUnsubmittedTariffDraft(m.document),false);
 for(const id of m.forms.keys()){
  m.forms.get(id).push(textInput('  95,50  '));
  assert.equal(hasUnsubmittedTariffDraft(m.document),true,id);
  m.forms.get(id).length=0;
 }
 m.setDirty(true);
 assert.equal(hasUnsubmittedTariffDraft(m.document),true,'unsaved extra');
 m.setDirty(false);
 assert.equal(hasUnsubmittedTariffDraft(m.document),false);
 m.forms.get('company-rates-form').push({type:'checkbox',value:'on',disabled:false});
 assert.equal(hasUnsubmittedTariffDraft(m.document),false,'unchecked default is not a draft');
 assert.match(read('amministratore/report.mjs'),
  /lastView==='rates'&&view!=='rates'&&hasUnsubmittedTariffDraft\(document\)/);
 assert.match(read('amministratore/report.mjs'),
  /!window\.confirm\('Ci sono modifiche alle tariffe non ancora salvate/);
});
test('a private base tariff update never retroactively changes journey prices',()=>{
 const initial=upsertTariff(emptyState(),{client:'CLIENTE QA',city:'ROMA',cents:7600});
 const historic=createTrip({date:'2026-09-14',client:'CLIENTE QA',city:'ROMA',
  container:'BILICO',services:[]},initial);
 assert.equal(historic.fareCents,7600);
 const before=JSON.stringify(historic);
 const updated=upsertTariff({...initial,trips:[historic]},
   {client:'CLIENTE QA',city:'ROMA',cents:9400});
 assert.equal(updated.tariffs[0].cents,9400);
 assert.equal(updated.trips[0].fareCents,7600);
 assert.equal(JSON.stringify(updated.trips[0]),before);
});
test('a private extra price update never changes saved extra snapshots',()=>{
 const withRate=upsertExtraRates(emptyState(),{...emptyState().extraRates,adr:1250});
 const original=createTrip({date:'2026-09-15',client:'CLIENTE QA',city:'ROMA',
   container:'REEFER',services:['adr']},withRate);
 assert.equal(original.extraCents.adr,1250);
 const before=JSON.stringify(original);
 const next=upsertExtraRates({...withRate,trips:[original]},
   {...withRate.extraRates,adr:1800});
 assert.equal(next.extraRates.adr,1800);
 assert.equal(next.trips[0].extraCents.adr,1250);
 assert.equal(JSON.stringify(next.trips[0]),before);
});

test('editing a saved trip preserves both pickup snapshots and selected extras',()=>{
 let catalog=upsertTariff(emptyState(),{client:'CLIENTE A',city:'ROMA',cents:7600});
 catalog=upsertTariff(catalog,{client:'CLIENTE B',city:'NAPOLI',cents:5000});
 catalog=upsertExtraRates(catalog,{...catalog.extraRates,adr:1250,pernotto:200});
 const fields={date:'2026-09-19',client:'CLIENTE A',city:'ROMA',
  container:'REEFER',secondClient:'CLIENTE B',secondCity:'NAPOLI',
  services:['adr'],note:'PRIMA NOTA'};
 const saved=createTrip(fields,catalog);
 assert.deepEqual([saved.fareCents,saved.secondFareCents,saved.extraCents.adr],[7600,5000,1250]);
 let changed=upsertTariff(catalog,{client:'CLIENTE A',city:'ROMA',cents:9000});
 changed=upsertTariff(changed,{client:'CLIENTE B',city:'NAPOLI',cents:6500});
 changed=upsertExtraRates(changed,{...changed.extraRates,adr:2100,pernotto:750});
 const revised=createTrip({...fields,note:'NOTA CORRETTA',
  services:['adr','pernotto']},changed,saved);
 assert.equal(revised.fareCents,7600);
 assert.equal(revised.secondFareCents,5000);
 assert.equal(revised.extraCents.adr,1250);
 assert.equal(revised.extraCents.pernotto,750,'New service uses currently configured rate');
 assert.equal(revised.id,saved.id);
 assert.equal(revised.createdAt,saved.createdAt);
 assert.equal(revised.note,'NOTA CORRETTA');
 const future=createTrip({...fields,services:['adr','pernotto']},changed);
 assert.equal(future.fareCents,9000);
 assert.equal(future.secondFareCents,6500);
 assert.equal(future.extraCents.adr,2100);
});
test('a previously unpriced saved trip must remain unpriced when its route is unchanged',()=>{
 const state=emptyState();
 const input={date:'2026-09-19',client:'CLIENTE NON CONFIGURATO',city:'BARI',
   container:'BILICO',services:['adr']};
 const old=createTrip(input,state);
 assert.equal(old.fareCents,null);
 assert.equal(old.extraCents.adr,null);
 const newer=upsertTariff(upsertExtraRates(state,{...state.extraRates,adr:2400}),
  {client:input.client,city:input.city,cents:7700});
 const edited=createTrip(input,newer,old);
 assert.equal(edited.fareCents,null);
 assert.equal(edited.extraCents.adr,null);
 const newTrip=createTrip(input,newer);
 assert.equal(newTrip.fareCents,7700);
 assert.equal(newTrip.extraCents.adr,2400);
});
