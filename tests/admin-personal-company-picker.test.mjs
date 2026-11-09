import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,emptyExtraRates,validateState} from '../shared/domain.mjs';
import {applyAdminRecordEdit} from '../shared/admin-record-operations.mjs';
import {buildDriverCustomerCatalog,filterDriverCustomerCatalog} from '../amministratore/driver-customer-catalog.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function sample(){
 const state=emptyState();
 state.customers=[
  {id:'old',name:'CLIENTE PRIVATO',city:'NAPOLI',address:'VIA PRIVATA',
   phone:'0810000000',vat:'IT12345678901'},
  {id:'other',name:'CLIENTE ESISTENTE',city:'BARI',address:'VIA ALTRA',phone:'',vat:''}
 ];
 state.tariffs=[{id:'rate1',customerId:'old',client:'CLIENTE PRIVATO',
  city:'NAPOLI',cents:8500}];
 state.trips=[{
  id:'trip1',date:'2026-11-08',client:'CLIENTE PRIVATO',city:'NAPOLI',
  container:'ABCD1234567',secondClient:'',secondCity:'',note:'STORICO',
  services:[],fareCents:8500,secondFareCents:null,sumPickupFares:false,
  extraCents:emptyExtraRates(),createdAt:'2026-11-08T08:00:00Z',updatedAt:'2026-11-08T08:00:00Z'
 }];
 return validateState(state);
}
test('changing the private customer fields keeps old trips, prices, and audit-ready ID intact',()=>{
 const state=sample();
 const replacement={name:'CLIENTE AZIENDALE',city:'SALERNO',
  address:'VIA NUOVA 15',phone:'',vat:''};
 const result=applyAdminRecordEdit(state,{action:'update',category:'customer',
  id:'old',patch:replacement},'2026-11-09T15:00:00.000Z');
 assert.equal(result.after.id,'old');
 assert.equal(result.after.name,'CLIENTE AZIENDALE');
 assert.equal(result.after.city,'SALERNO');
 assert.equal(result.after.address,'VIA NUOVA 15');
 assert.equal(result.after.phone,'');
 assert.equal(result.after.vat,'');
 assert.equal(result.state.tariffs[0].client,'CLIENTE AZIENDALE');
 assert.equal(result.state.tariffs[0].cents,8500);
 assert.equal(result.state.trips[0].client,'CLIENTE PRIVATO');
 assert.equal(result.state.trips[0].fareCents,8500);
 assert.equal(state.customers[0].name,'CLIENTE PRIVATO');
});
test('server model refuses accidental duplicate personal customer identity',()=>{
 assert.throws(()=>applyAdminRecordEdit(sample(),{
  action:'update',category:'customer',id:'old',
  patch:{name:'CLIENTE ESISTENTE'}},'2026-11-09T15:00:00.000Z'),/Nomi clienti|duplic/i);
});
test('only company records are offered to replace a private customer',()=>{
 const catalog=buildDriverCustomerCatalog({
  sharedSites:[{name:'CLIENTE MAPS',city:'ACERRA',address:'VIA MAPS 1'},
   {name:'CLIENTE MANUALE',city:'NAPOLI',address:''}],
  companyRates:[{client:'CLIENTE TARIFFA',city:'CASERTA',cents:4500}],
  personalCustomers:[{name:'CLIENTE PERSONALE',city:'NAPOLI',address:'VIA PRIVATA'}]
 });
 assert.equal(filterDriverCustomerCatalog(catalog,{scope:'shared'}).length,3);
 assert.equal(filterDriverCustomerCatalog(catalog,{scope:'shared',query:'via privata'}).length,0);
 assert.equal(filterDriverCustomerCatalog(catalog,{scope:'shared',query:'acerra via maps'}).length,1);
 assert.equal(filterDriverCustomerCatalog(catalog,{scope:'personal'}).length,1);
});
test('personal customer picker is MFA-authored and requires explicit saved edit',()=>{
 const editor=read('amministratore/driver-records.mjs');
 const styles=read('amministratore/driver-records.css');
 assert.match(editor,/function personalCompanyPicker\(form,/);
 assert.match(editor,/if\(item\)\{\s*companyPicker=personalCompanyPicker/);
 assert.match(editor,/companyPicker\.catalog\(combined/);
 assert.match(editor,/filterDriverCustomerCatalog\(sites,\{scope:'shared',query:input\.value\}\)/);
 assert.match(editor,/phone\.value='';vat\.value=''/);
 assert.match(editor,/isDuplicate\(site\.name\)/);
 assert.match(editor,/ratesAcknowledged\.required=true/);
 assert.match(editor,/confirmation\.hidden=false/);
 assert.match(editor,/if\(companyPicker\?\.confirmation\)form\.append\(companyPicker\.confirmation\)/);
 assert.match(editor,/MODIFICA NON ANCORA SALVATA/);
 assert.match(editor,/records-company-jump/);
 assert.doesNotMatch(editor,/if\(ratesAcknowledged&&!ratesAcknowledged\.checked\)/);
 assert.match(styles,/#admin-records-panel \.records-private-rate-ack input\[type=checkbox\]/);
 assert.match(styles,/width:22px;height:22px;min-width:22px;min-height:22px/);
 assert.match(editor,/account\.adminRecords\('mutate'/);
 assert.match(editor,/driverId:owner,expectedRevision/);
 assert.match(styles,/\.records-company-picker \.records-site-results/);
 assert.doesNotMatch(editor,/innerHTML|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});
