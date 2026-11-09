import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDriverCustomerCatalog,filterDriverCustomerCatalog} from '../amministratore/driver-customer-catalog.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sites=buildDriverCustomerCatalog({
 sharedSites:[
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA (NA)',address:'LOCALITÀ PANTANO / VIA DELLE INDUSTRIE',mapsUrl:'https://maps.app.goo.gl/a'},
  {name:'ACETIFICIO ANDREA MILANO SRL',city:'SAN GIOVANNI A TEDUCCIO',address:'VIALE DUE GIUGNO 115/N',mapsUrl:'https://maps.app.goo.gl/b'}
 ],
 companyRates:[{client:'CLIENTE CONDIVISO MANUALE',city:'AVELLINO',cents:7600}],
 personalCustomers:[{name:'ACETIFICIO ADREA MILANO',city:'S. GIOVANNI ATEDUCCIO',address:'DEPOSITO PERSONALE'}]
});

test('shared trip selector excludes private autista customers',()=>{
 const shared=filterDriverCustomerCatalog(sites,{scope:'shared'});
 assert.equal(shared.length,3);
 assert.ok(shared.every(x=>x.source==='maps'||x.source==='company'));
 assert.ok(shared.some(x=>x.name==='CLIENTE CONDIVISO MANUALE'));
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'personal'}).length,1);
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'all'}).length,4);
 assert.deepEqual(filterDriverCustomerCatalog(sites,{scope:'typo'}),[]);
});

test('shared searches are accent insensitive across names, places and addresses',()=>{
 const ac=filterDriverCustomerCatalog(sites,{scope:'shared',query:'ACETIFICIO ACERRA'});
 assert.equal(ac.length,1);
 assert.match(ac[0].address,/PANTANO/);
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'shared',query:'giugno 115'}).length,1);
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'shared',query:'andrea milano'}).length,2);
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'shared',query:'adrea milano'}).length,0);
 assert.equal(filterDriverCustomerCatalog(sites,{scope:'personal',query:'adrea milano'}).length,1);
});

test('existing trip fare is not automatically overwritten when customer is replaced',()=>{
 const src=read('amministratore/driver-records.mjs');
 assert.match(src,/keepFare:Boolean\(item\)/);
 assert.match(src,/if\(!keepFare&&cents!==null&&!fare\.value\.trim\(\)\)fare\.value=euro\(cents\)/);
 assert.match(src,/applyFare\.addEventListener\('click'/);
 assert.match(src,/fare\.value=euro\(suggestedCents\)/);
 assert.match(src,/account\.adminRecords\('mutate'/);
 assert.match(src,/driverId:owner,expectedRevision/);
 assert.match(src,/input\.setAttribute\('role','combobox'\)/);
 assert.match(src,/results\.setAttribute\('role','listbox'\)/);
});

test('mobile shared customer result list cannot compress rows into overlap',()=>{
 const css=read('amministratore/driver-records.css');
 assert.match(css,/\.records-site-results\s*\{\s*display:flex;flex-direction:column/);
 assert.match(css,/\.records-site-option\s*\{\s*flex:0 0 auto/);
 assert.match(css,/\.records-site-scope\.selected/);
 assert.match(css,/\.records-site-apply-fare\[hidden\]/);
});
