import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,validateState,createTrip,tripAmounts} from '../shared/domain.mjs';
import {buildCustomerDirectory,queryCustomerDirectory,removePersonalCustomer,restorePersonalCustomer,CUSTOMER_BATCH_SIZE} from '../shared/customer-directory-v5.mjs';
import {parseCustomerCsv,mergeCustomerCsv,previewCustomerCsvChanges,exportCustomerCsv} from '../shared/customer-csv.mjs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const company={name:'CITTÀ AZIENDA SPA',city:'BITONTO (BA)',address:'VIA ROMA 10',
 mapsUrl:'https://maps.app.goo.gl/CertainLink'};
const personal={id:'p-1',name:'CITTÀ AZIENDA SPA',city:'BITONTO',address:'VIA ROMA 10',
 vat:'',phone:'+39 080 1234567'};
const cityOnly={id:'p-2',name:'CITTÀ AZIENDA SPA',city:'BITONTO',address:'',
 vat:'',phone:''};

test('verified same-street contact appears once in all and remains editable under Miei',()=>{
 const shared=[company,{...company,mapsUrl:company.mapsUrl+'?g_st=ac'}];
 const before=structuredClone(shared);
 const model=buildCustomerDirectory(shared,[personal]);
 assert.equal(model.shared.length,1);
 assert.equal(model.personal.length,1);
 assert.equal(model.all.length,1);
 assert.strictEqual(model.shared[0].linkedPersonal,personal);
 assert.equal(model.personal[0].linkedShared,company);
 assert.equal(queryCustomerDirectory(model,{scope:'all'}).counts.personal,1);
 assert.equal(queryCustomerDirectory(model,{scope:'personal'}).visible[0].customer.id,'p-1');
 assert.equal(queryCustomerDirectory(model,{query:'080 1234'}).total,1);
 assert.deepEqual(shared,before,'personal phone must never modify shared customer data');
});

test('same name/city without reliable address is visible and flagged, never silently merged',()=>{
 const model=buildCustomerDirectory([company],[cityOnly]);
 assert.equal(model.all.length,2);
 assert.equal(model.personal.length,1);
 assert.equal(model.personal[0].possibleDuplicate,true);
 assert.equal(model.personal[0].linkedShared,null);
 assert.equal(model.shared[0].linkedPersonal,undefined);
 assert.equal(queryCustomerDirectory(model,{scope:'all'}).total,2);
 const other={...company,address:'VIA ROMA 20',mapsUrl:'https://maps.app.goo.gl/OtherSite'};
 const different=buildCustomerDirectory([company,other],[personal]);
 assert.equal(different.shared.length,2,'different warehouses cannot be merged by name only');
 assert.equal(different.all.length,2);
});

test('indexed case/accent-insensitive search, source scope and progressive paging',()=>{
 const generated=Array.from({length:1200},(_,i)=>({
  id:'personal-'+i,name:'DEPOSITO NUMERO '+String(i).padStart(4,'0'),
  city:i%2?'AVELLINO':'BENEVENTO',address:'VIA TEST '+i,vat:'',phone:''
 }));
 const model=buildCustomerDirectory([company],[...generated]);
 const all=queryCustomerDirectory(model);
 assert.equal(all.total,1201);
 assert.equal(all.visible.length,CUSTOMER_BATCH_SIZE);
 assert.equal(all.hasMore,true);
 assert.equal(queryCustomerDirectory(model,{limit:48}).visible.length,48);
 assert.equal(queryCustomerDirectory(model,{scope:'shared'}).total,1);
 assert.equal(queryCustomerDirectory(model,{scope:'personal'}).total,1200);
 assert.equal(queryCustomerDirectory(model,{query:'citta azienda'}).total,1);
 assert.equal(queryCustomerDirectory(model,{query:'deposito 0119',scope:'personal'}).total,1);
 assert.equal(queryCustomerDirectory(model,{query:'nessun nome'}).total,0);
 assert.throws(()=>queryCustomerDirectory(model,{scope:'admin'}),/Filtro/);
 assert.equal(generated.length,1200);
});

test('delete and undo preserve exact old client, tariff snapshots and journeys',()=>{
 const trip=createTrip({date:'2026-11-09',container:'MSDU1234567',
  client:'CITTÀ AZIENDA SPA',city:'BITONTO',services:[]},emptyState());
 trip.fareCents=7800;
 const stored=validateState({...emptyState(),customers:[personal,{id:'other',name:'ALTRA SPA',city:'NAPOLI',address:'',vat:'',phone:''}],
  tariffs:[{id:'t1',customerId:'p-1',client:personal.name,city:'BITONTO',cents:7800},
   {id:'t2',customerId:'other',client:'ALTRA SPA',city:'NAPOLI',cents:9000}],trips:[trip]});
 const {next,snapshot}=removePersonalCustomer(stored,'p-1');
 assert.equal(next.customers.length,1);
 assert.equal(next.tariffs.length,1);
 assert.deepEqual(next.trips,stored.trips);
 assert.equal(tripAmounts(next.trips[0]).totalCents,7800);
 const restored=restorePersonalCustomer(next,snapshot);
 assert.deepEqual(restored.customers,stored.customers);
 assert.deepEqual(restored.tariffs,stored.tariffs);
 assert.deepEqual(restored.trips,stored.trips);
 assert.equal(tripAmounts(restored.trips[0]).totalCents,7800);
 assert.throws(()=>restorePersonalCustomer(stored,snapshot),/cliente/i);
 const conflict=validateState({...next,customers:[...next.customers,{...personal,id:'new-id'}]});
 assert.throws(()=>restorePersonalCustomer(conflict,snapshot),/cliente/i);
});

test('CSV preview shows exact fields before write and both old and new headers work',()=>{
 const s=validateState({...emptyState(),customers:[personal]});
 const csv='CLIENTE;PARTITA IVA;CITTÀ;INDIRIZZO;TELEFONO\nCITTÀ AZIENDA SPA;;BITONTO;VIA ROMA 10;+39 080 998877\nALTRO CLIENTE;;CASERTA;VIA NUOVA 4;081 1234567\n';
 const rows=parseCustomerCsv(csv);
 const fingerprint=JSON.stringify(s);
 const preview=previewCustomerCsvChanges(s,rows);
 assert.equal(preview.added,1);
 assert.equal(preview.updated,1);
 assert.equal(preview.unchanged,0);
 assert.equal(preview.changed,2);
 const phone=preview.details.find(item=>item.name===personal.name)?.fields.find(field=>field.field==='phone');
 assert.ok(phone);
 assert.equal(phone.before,personal.phone);
 assert.equal(phone.after,'+39 080 998877');
 assert.equal(JSON.stringify(s),fingerprint,'preview must not write to data');
 const imported=mergeCustomerCsv(s,rows).state;
 assert.equal(imported.customers.find(item=>item.id===personal.id).phone,'+39 080 998877');
 assert.equal(parseCustomerCsv(exportCustomerCsv(imported)).length,2);
 assert.equal(parseCustomerCsv('CLIENTE;PARTITA IVA;CITTÀ;INDIRIZZO\nALTRO CLIENTE;;CASERTA;VIA 2\n')[0].phone,'');
 assert.equal(previewCustomerCsvChanges(imported,parseCustomerCsv(exportCustomerCsv(imported))).changed,0);
});

test('real customer view has account-isolated undo, source badges and guarded CSV review',()=>{
 assert.match(app,/function currentCustomerDirectory\(\)/);
 assert.match(app,/queryCustomerDirectory\(currentCustomerDirectory\(\)/);
 assert.match(app,/function customerCard\(customer,\{shared=false,linkedPersonal=null,linkedShared=null,possibleDuplicate=false\}/);
 assert.match(app,/Possibile corrispondenza aziendale/);
 assert.match(app,/Modifica mio contatto/);
 assert.match(app,/function deletePersonalCustomer\(customer\)/);
 assert.match(app,/function undoDeletedPersonalCustomer\(\)/);
 assert.match(app,/saved[.]owner!==user[?][.]id/);
 assert.match(app,/removePersonalCustomer\(state,customer[.]id\)/);
 assert.match(app,/restorePersonalCustomer\(state,saved[.]snapshot\)/);
 assert.match(app,/previewCustomerCsvChanges\(state,rows,8\)/);
 assert.match(app,/JSON[.]stringify\(state[.]customers\)!==openingFingerprint/);
 assert.match(app,/lastDeletedCustomer=null/);
 assert.match(app,/customerDirectoryLimit\+=CUSTOMER_BATCH_SIZE/);
});
