import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreDeletedPersonalCustomer,customerCsvChanges} from '../shared/customer-quality.mjs';
import {emptyState,validateState} from '../shared/domain.mjs';
const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const contact={id:'cust-1',name:'ACCIAI SPECIALI TERNI',city:'TERNI',address:'VIA A',vat:'',phone:''};
test('undo restores original personal contact and tariff without changing historic trips',()=>{
 const original=validateState({...emptyState(),customers:[contact]});
 const tariff={id:'tariff-1',customerId:contact.id,client:contact.name,city:'TERNI',amountCents:12000};
 const state={...original,customers:[],tariffs:[],trips:[{id:'journey-1',client:contact.name,fareCents:12000}]};
 const restored=restoreDeletedPersonalCustomer(state,contact,[tariff]);
 assert.deepEqual(restored.customers,[contact]);
 assert.deepEqual(restored.tariffs,[tariff]);
 assert.deepEqual(restored.trips,state.trips);
 assert.deepEqual(state.customers,[]);
});
test('undo refuses a conflicting customer and never overwrites another record',()=>{
 const state={customers:[{...contact,id:'new-id'}],tariffs:[]};
 assert.throws(()=>restoreDeletedPersonalCustomer(state,contact,[]),/Esiste già/);
 assert.throws(()=>restoreDeletedPersonalCustomer({customers:[contact],tariffs:[]},contact),/già presente/);
 assert.throws(()=>restoreDeletedPersonalCustomer(state,{...contact,id:''}),/non valido/);
});
test('undo skips tariff IDs already present',()=>{
 const tariff={id:'tariff-1',client:contact.name};
 const result=restoreDeletedPersonalCustomer({customers:[],tariffs:[tariff]},contact,[tariff]);
 assert.equal(result.tariffs.length,1);
});
test('CSV preview includes only effective changes and new contacts',()=>{
 const rows=[{...contact,city:'ROMA',phone:'123'}, {...contact,name:'NEW',id:'cust-2'}];
 const diff=customerCsvChanges([contact],rows);
 assert.equal(diff.total,2);
 assert.deepEqual(diff.shown[0],{name:contact.name,kind:'update',fields:['city','phone']});
 assert.deepEqual(diff.shown[1],{name:'NEW',kind:'new',fields:[]});
 assert.equal(customerCsvChanges([contact],[{...contact}]).total,0);
});
test('app offers account-scoped undo and previews CSV differences',()=>{
 assert.match(app,/let lastDeletedCustomer=null/);
 assert.match(app,/function customerUndoAction\(\)/);
 assert.match(app,/snapshot[.]owner!==accountAccess[.]getAccountId\(\)/);
 assert.match(app,/restoreDeletedPersonalCustomer\(state,snapshot[.]customer,snapshot[.]tariffs\)/);
 assert.match(app,/const changes=customerCsvChanges\(state[.]customers,rows\)/);
 assert.match(app,/lastDeletedCustomer=\{customer:deletedCustomer,tariffs:deletedTariffs,owner\}/);
});
