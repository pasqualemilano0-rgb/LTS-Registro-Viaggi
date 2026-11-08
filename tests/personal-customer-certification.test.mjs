import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPersonalCustomerCertification as review}
 from '../amministratore/personal-customer-certification.mjs';

const personal={id:'private-a',name:'ALTERGON ITALIA SRL',city:'MORRA DE SANCTIS',
 address:'',phone:'',vat:''};
const proposal={name:'Altergon Italia S.r.l.',city:'Morra de Sanctis (AV)',
 address:'VIA DELLA LOGISTICA 10, MORRA DE SANCTIS',
 mapsUrl:'https://maps.app.goo.gl/RealDepotOne',warnings:[]};
const shared={...proposal,source:'google_maps_link'};

test('verified shared depot allows consolidating an unambiguous personal copy',()=>{
 const decision=review(personal,proposal,[shared],[personal]);
 assert.equal(decision.mode,'existing');
 assert.equal(decision.site,shared);
});

test('new verified depot can be shared first, but no edit is performed by pure preflight',()=>{
 const decision=review(personal,proposal,[],[personal]);
 assert.equal(decision.mode,'new');
 assert.equal(personal.address,'');
});

test('a similar name in the same city never merges a different warehouse',()=>{
 const different={...shared,address:'VIA INDUSTRIA 200',
  mapsUrl:'https://maps.app.goo.gl/DifferentWarehouse'};
 const decision=review(personal,proposal,[different],[personal]);
 assert.equal(decision.mode,'blocked');
 assert.match(decision.reason,/altre sedi/i);
});

test('personal street must match certified Maps street before merging',()=>{
 const record={...personal,address:'VIA ROMA 4'};
 assert.equal(review(record,proposal,[shared],[record]).mode,'blocked');
});

test('Google Maps name and city are both mandatory identity evidence',()=>{
 assert.equal(review(personal,{...proposal,name:'ALTRA SOCIETÀ'},[shared],[personal]).mode,'blocked');
 assert.equal(review(personal,{...proposal,city:'AVELLINO'},[shared],[personal]).mode,'blocked');
});

test('ambiguous same-company personal rows are never merged automatically',()=>{
 const other={...personal,id:'private-b'};
 assert.equal(review(personal,proposal,[shared],[personal,other]).mode,'blocked');
});

test('shared record with missing address blocks unsafe deduplication',()=>{
 const manual={name:shared.name,city:shared.city,address:'',mapsUrl:'',source:'manual'};
 assert.equal(review(personal,proposal,[manual],[personal]).mode,'blocked');
});

test('placeholder Maps addresses are not eligible for certification',()=>{
 assert.equal(review(personal,{...proposal,address:'INDIRIZZO STRADALE DA CONFERMARE'},[],[personal]).mode,'blocked');
});

test('generic Google Maps paths with differing search queries never identify the same site',()=>{
 const a={...proposal,mapsUrl:'https://www.google.com/maps/search/?query=place-one'};
 const b={...shared,address:'VIA LONTANA 30',
  mapsUrl:'https://www.google.com/maps/search/?query=place-two'};
 const p={...personal,address:a.address};
 assert.equal(review(p,a,[b],[p]).mode,'new');
});

test('identical saved Maps short link can identify a shared site despite a corrected street',()=>{
 const legacy={...shared,address:'INDIRIZZO DA CONFERMARE'};
 assert.equal(review(personal,proposal,[legacy],[personal]).mode,'existing');
});
