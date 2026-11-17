import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedLocalityFromSharedMaps} from '../amministratore/maps-free-locality.mjs';
const link='https://maps.app.goo.gl/WJDJFhiy1S15tMLu8';
const proposed={name:'RUSSO MANGIMI SPA',city:'',address:'V. Nazionale delle Puglie, 41, 80035 S.S. 7BIS NA',
 mapsUrl:link,warnings:['La città non è disponibile nel link: completala manualmente.']};
const known={name:'RUSSO MANGIMI S.P.A.',city:'NOLA',address:'Via Nazionale delle Puglie 41, 80035 Nola NA',
 mapsUrl:link};
test('Unique verified shared Maps site supplies a previously approved Comune at zero API cost',()=>{
 const recovered=approvedLocalityFromSharedMaps([known],proposed);
 assert.equal(recovered.city,'NOLA');
 assert.equal(recovered.address,'VIA NAZIONALE DELLE PUGLIE 41, 80035 NOLA NA');
 assert.equal(recovered.mapsUrl,link);
 assert.equal(recovered.name,proposed.name);
 assert.match(recovered.warnings.at(-1),/elenco condiviso LTS/);
 assert.equal(proposed.city,'','Do not mutate the Google Maps proposal');
});
test('No autofill if link, company, postcode or approved locality are untrusted',()=>{
 const variations=[
  {...known,mapsUrl:'https://maps.app.goo.gl/Other'},
  {...known,name:'ALTRA AZIENDA'},
  {...known,address:'Via Roma 1, 80100 Napoli NA'},
  {...known,city:'S.S. 7BIS'},
  {...known,city:''}
 ];
 for(const value of variations)assert.equal(approvedLocalityFromSharedMaps([value],proposed),null);
 assert.equal(approvedLocalityFromSharedMaps([],proposed),null);
 assert.equal(approvedLocalityFromSharedMaps(null,proposed),null);
 assert.equal(approvedLocalityFromSharedMaps([known,known],proposed),null,'Ambiguous duplicate site must never be inferred');
});
test('Do not replace city already provided by Google Maps',()=>{
 assert.equal(approvedLocalityFromSharedMaps([known],{...proposed,city:'MARIGLIANO'}),null);
});
