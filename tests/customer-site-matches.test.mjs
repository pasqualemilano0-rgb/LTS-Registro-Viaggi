import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedStreetKey,sameSharedSite,matchingSharedCustomer,
 dedupedCustomerDirectory} from '../shared/customer-site-matches.mjs';

const bitonto={name:'CONSERVA SPA',city:'BITONTO',address:'S.P. 231 KM 2,5 N.C. 70032 BITONTO BA',
 mapsUrl:'https://maps.app.goo.gl/PvKBmXfYeTvjX2su7'};
const repeated={name:'Conserva SPA',city:'Bitonto (BA)',
 address:'SP231 KM 2, 5, 70032 BITONTO BA',
 mapsUrl:'https://maps.app.goo.gl/SNBEcsTu7ufQNye18'};
const pomezia={name:'CONSERVA SPA',city:'SANTA PALOMBA (POMEZIA)',
 address:'SANTA PALOMBA POMEZIA',mapsUrl:'https://maps.app.goo.gl/VYfgABa1i6VxdHzY9'};

test('Maps links with the same company, municipality and normalized address are one site',()=>{
 assert.equal(normalizedStreetKey(bitonto.address),normalizedStreetKey(repeated.address));
 assert.equal(sameSharedSite(bitonto,repeated),true);
 assert.equal(sameSharedSite(bitonto,pomezia),false);
 const rows=dedupedCustomerDirectory([bitonto,repeated,pomezia],[]);
 assert.equal(rows.shared.length,2);
 assert.equal(rows.shared[0].mapsUrl,bitonto.mapsUrl);
});
test('same company and city must NOT merge different street locations',()=>{
 const another={...bitonto,address:'VIA ROMA 12',mapsUrl:'https://maps.app.goo.gl/newpoint'};
 assert.equal(sameSharedSite(bitonto,another),false);
 assert.equal(dedupedCustomerDirectory([bitonto,another],[]).shared.length,2);
});
test('a personal clone is hidden from the combined list, never deleted from private archives',()=>{
 const privateCustomer={id:'private-1',name:'CONSERVA SPA',city:'BITONTO',
  address:'SP231 KM 2, 5, 70032 BITONTO BA',phone:'+390800000000'};
 const local=[privateCustomer];
 const result=dedupedCustomerDirectory([bitonto,repeated,pomezia],local);
 assert.equal(result.shared.length,2);
 assert.equal(result.personal.length,0);
 assert.equal(result.matchedPersonal.length,1);
 assert.equal(result.matchedPersonal[0].personal,privateCustomer);
 assert.equal(result.shared.find(x=>x.city==='BITONTO').phone,'+390800000000');
 assert.equal(local.length,1);
 assert.equal(local[0].phone,'+390800000000');
});
test('a city-only personal entry can match one company site, but ambiguous warehouses remain personal',()=>{
 const unknown={id:'personal-2',name:'CONSERVA SPA',city:'BITONTO',address:''};
 assert.equal(matchingSharedCustomer([bitonto],unknown),bitonto);
 assert.equal(matchingSharedCustomer([bitonto,{...bitonto,address:'VIA ROMA 12'}],unknown),null);
 assert.equal(dedupedCustomerDirectory([bitonto,{...bitonto,address:'VIA ROMA 12',mapsUrl:'https://maps.app.goo.gl/another-warehouse'}],[unknown]).personal.length,1);
});
test('a business with a different name at the same street is not merged',()=>{
 assert.equal(sameSharedSite(bitonto,{...bitonto,name:'ALTRO CLIENTE'}),false);
 const x={name:'CONSERVA SPA',city:'BITONTO',address:'VIA ROMA 3'};
 assert.equal(matchingSharedCustomer([bitonto],x),null);
});
test('existing Google Maps link is recognized even with tracking query strings',()=>{
 const a={...bitonto,address:'INDIRIZZO STRADALE DA CONFERMARE'};
 const b={...repeated,address:'ALTRA VIA',mapsUrl:bitonto.mapsUrl+'?g_st=ac'};
 assert.equal(sameSharedSite(a,b),true);
});

test('punctuation variants are possible aliases, never proof of a shared identity',()=>{
 const company={name:'ACME SRL',city:'NAPOLI',address:'VIA PORTO 1'};
 const personal={...company,id:'personal-alias',name:'ACME-SRL'};
 assert.equal(sameSharedSite(company,personal),false);
 assert.equal(matchingSharedCustomer([company],personal),null);
 const result=dedupedCustomerDirectory([company],[personal]);
 assert.equal(result.shared.length,1);
 assert.deepEqual(result.personal,[personal]);
});

test('Maps search queries and place identity parameters distinguish warehouses',()=>{
 const site={name:'ACME SRL',city:'NAPOLI',address:'INDIRIZZO STRADALE DA CONFERMARE'};
 const first={...site,mapsUrl:'https://www.google.com/maps/search/?api=1&query=VIA+ALFA+1'};
 const second={...site,mapsUrl:'https://www.google.com/maps/search/?api=1&query=VIA+BETA+2'};
 assert.equal(sameSharedSite(first,second),false);
 assert.equal(dedupedCustomerDirectory([first,second],[]).shared.length,2);
 assert.equal(sameSharedSite(first,{...first,mapsUrl:first.mapsUrl+'&utm_source=message&g_st=ac'}),true);
 assert.equal(sameSharedSite(first,{...first,mapsUrl:first.mapsUrl+'&query_place_id=another-place'}),false);
 assert.equal(sameSharedSite({...first,address:'VIA ALFA 1'},{...first,address:'VIA BETA 2'}),false);
});

test('indexed dedup handles many unrelated sites and preserves duplicate originals',()=>{
 const sites=Array.from({length:1200},(_,i)=>({
  name:'COMPANY '+i,city:'NAPOLI',address:'VIA '+i,mapsUrl:'https://maps.app.goo.gl/id'+i
 }));
 const personal=sites.slice(0,150).map((site,i)=>({...site,id:'p-'+i,phone:'081000'+i}));
 const result=dedupedCustomerDirectory([...sites,sites[0]],personal);
 assert.equal(result.shared.length,1200);
 assert.equal(result.personal.length,0);
 assert.equal(result.matchedPersonal.length,150);
 assert.equal(result.shared[0].phone,'0810000');
 assert.equal(result.shared[1199].phone,undefined);
});
