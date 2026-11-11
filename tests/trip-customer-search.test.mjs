import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combinedTripCustomerChoices,filterTripCustomerChoices} from '../shared/trip-customer-choices.mjs';
import {companyFareSnapshot} from '../shared/company-fares.mjs';

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
 assert.deepEqual(ranked.map(c=>c.name),['FERRAMENTA FELICE','FERRO NORD','ACTION FERENTINO - CENTRO LOGISTICO','ALFA FERRARI SRL']);
});
test('input suggestions call dedicated matcher; customer directory still uses full-field search',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/choices=filterTripCustomerChoices\(all,query,12\)/);
 assert.doesNotMatch(app,/choices=filterSharedCustomers\(all,query\)/);
 assert.match(app,/const found=filterSharedCustomers\(directory.shared,companyCustomerSearch\)/);
});

test('company source and tariff lookup never transfer across punctuation aliases',()=>{
 const choices=combinedTripCustomerChoices({
  personal:[{name:'ACME-SRL',city:'NAPOLI'}],shared:[{siteId:'s1',name:'ACME SRL',city:'NAPOLI'}]
 });
 assert.equal(choices.length,2);
 const personal=choices.find(row=>row.name==='ACME-SRL');
 assert.equal(personal.fromCompany,false);
 assert.equal(personal.siteId,undefined);
 assert.equal(companyFareSnapshot([{client:'ACME SRL',city:'NAPOLI',cents:12345}],true,personal.name,personal.city),null);
 assert.equal(choices.find(row=>row.name==='ACME SRL').fromCompany,true);
});

test('same-name warehouses retain their distinct site identities, addresses and labels',()=>{
 const sites=[{siteId:'warehouse-a',name:'ACME SRL',city:'NAPOLI',address:'VIA ALFA 1'},
  {siteId:'warehouse-b',name:'ACME SRL',city:'NAPOLI',address:'VIA BETA 2'}];
 const before=structuredClone(sites);
 const choices=combinedTripCustomerChoices({shared:sites});
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(row=>row.siteId),['warehouse-a','warehouse-b']);
 assert.equal(new Set(choices.map(row=>row.choiceId)).size,2);
 assert.ok(choices[0].label.includes('VIA ALFA 1'));
 assert.ok(choices[1].label.includes('VIA BETA 2'));
 assert.deepEqual(sites,before);
 const maps=combinedTripCustomerChoices({shared:sites.map((row,i)=>({...row,address:'',
  mapsUrl:'https://www.google.com/maps/search/?api=1&query='+i}))});
 assert.equal(maps.length,2);
});

test('existing choices API ranks observed frequency then recency from either pickup',()=>{
 const trips=[
  {id:'1',date:'2026-11-01',client:'ALFA A',city:'NOLA',secondClient:'ALFA Z',secondCity:'ACERRA'},
  {id:'2',date:'2026-11-02',client:'ALFA Z',city:'ACERRA',secondClient:'ALFA M',secondCity:'NAPOLI'},
  {id:'3',date:'2026-11-10',client:'ALFA M',city:'NAPOLI'}
 ];
 const choices=combinedTripCustomerChoices({trips});
 assert.deepEqual(filterTripCustomerChoices(choices,'ALFA').map(row=>row.name),['ALFA M','ALFA Z','ALFA A']);
 assert.equal(choices.find(row=>row.name==='ALFA Z').usageCount,2);
 assert.deepEqual(choices.find(row=>row.name==='ALFA Z').pickups,['second','first']);
 assert.equal(choices.find(row=>row.name==='ALFA Z').name,'ALFA Z');
});
