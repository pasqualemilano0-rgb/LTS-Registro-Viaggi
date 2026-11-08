import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combinedTripCustomerChoices,filterTripCustomerChoices} from '../shared/trip-customer-choices.mjs';

const rows=[
 {name:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA',address:'VIA DELLE INDUSTRIE'},
 {name:'ACETIFICIO ANDREA MILANO SRL',city:'SAN GIOVANNI A TEDUCCIO'},
 {name:'ACTION FERENTINO - CENTRO LOGISTICO',city:'FERENTINO'},
 {name:'AGRILOGISTICA SRL',city:'NOLA'},
 {name:'FERRAMENTA FELICE',city:'ACERRA'},
 {name:'FONDERIA SUD',city:'NAPOLI'},
 {name:'FRATELLI ROSSI SRL',city:'CASERTA'},
 {name:'ALFA FERRARI SRL',city:'NAPOLI'}
];

test('typing F never suggests clients starting A just because F appears inside name or city',()=>{
 const matches=filterTripCustomerChoices(rows,'F');
 assert.deepEqual(matches.map(c=>c.name),['FERRAMENTA FELICE','FONDERIA SUD','FRATELLI ROSSI SRL']);
 assert.ok(matches.every(c=>c.name.startsWith('F')));
});
test('typing a letter filters alphabetically and supports accented names',()=>{
 const names=[{name:'ÈLITE PORTI'},{name:'ECO TRASPORTI'},{name:'FERROVIE'},{name:'ÀNGELI GROUP'}];
 assert.deepEqual(filterTripCustomerChoices(names,'e').map(c=>c.name),['ECO TRASPORTI','ÈLITE PORTI']);
 assert.deepEqual(filterTripCustomerChoices(names,'a').map(c=>c.name),['ÀNGELI GROUP']);
 assert.deepEqual(filterTripCustomerChoices(names,'zz'),[]);
});
test('typing a longer term can match the beginning of any name word, but never an arbitrary substring',()=>{
 assert.deepEqual(filterTripCustomerChoices(rows,'MIL').map(c=>c.name),[
  'ACETIFICIO ANDREA MILANO SRL','ACETIFICIO ANDREA MILANO SRL']);
 assert.deepEqual(filterTripCustomerChoices(rows,'FER').map(c=>c.name),[
  'FERRAMENTA FELICE','ACTION FERENTINO - CENTRO LOGISTICO','ALFA FERRARI SRL']);
 assert.deepEqual(filterTripCustomerChoices(rows,'AR').map(c=>c.name),[]);
 assert.deepEqual(filterTripCustomerChoices(rows,'ANDREA MI').map(c=>c.name),[
  'ACETIFICIO ANDREA MILANO SRL','ACETIFICIO ANDREA MILANO SRL']);
});
test('name-first ranking, city-preserving duplicates and result cap',()=>{
 const merged=combinedTripCustomerChoices({shared:rows});
 assert.equal(merged.filter(c=>c.name==='ACETIFICIO ANDREA MILANO SRL').length,2);
 assert.equal(filterTripCustomerChoices(merged,'F',2).length,2);
 assert.equal(filterTripCustomerChoices(merged,'F',100)[0].name,'FERRAMENTA FELICE');
 assert.deepEqual(filterTripCustomerChoices(rows,''),[]);
 assert.deepEqual(filterTripCustomerChoices(null,'F'),[]);
 const ranked=filterTripCustomerChoices([...rows,{name:'FERRO NORD',city:'TORINO'}],'FER');
 assert.equal(ranked[0].name,'FERRO NORD');
});
test('input suggestions call dedicated matcher; customer directory still uses full-field search',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/choices=filterTripCustomerChoices\(all,query,12\)/);
 assert.doesNotMatch(app,/choices=filterSharedCustomers\(all,query\)/);
 assert.match(app,/const found=filterSharedCustomers\(directory.shared,companyCustomerSearch\)/);
});
