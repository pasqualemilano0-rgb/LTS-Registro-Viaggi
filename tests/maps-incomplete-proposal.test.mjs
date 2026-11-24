import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMapsProposal} from '../shared/maps-client.mjs';
const canonical='https://www.google.com/maps/place/Cliente+Delta/';
test('a truncated metadata title cannot hide a valid canonical place name',()=>{
 const proposal=mergeMapsProposal(canonical,'<meta property="og:title" content="D"><meta property="og:description" content="Via Roma 1, 80100 Napoli NA">');
 assert.equal(proposal.name,'CLIENTE DELTA');
 assert.equal(proposal.city,'NAPOLI');
 assert.equal(proposal.address,'VIA ROMA 1, 80100 NAPOLI NA');
});
test('single-letter place label remains incomplete rather than certified',()=>{
 const proposal=mergeMapsProposal('https://www.google.com/maps/place/D/','<title>D - Google Maps</title>');
 assert.equal(proposal.name,'');
 assert.equal(proposal.city,'');
 assert.equal(proposal.address,'');
 assert.ok(proposal.warnings.some(w=>w.includes('nome del cliente')));
});
test('directions URLs cannot be presented as a business from an unrelated title',()=>{
 const proposal=mergeMapsProposal('https://www.google.com/maps/dir/Napoli/Roma/','<title>Cliente Gamma - Google Maps</title>');
 assert.equal(proposal.name,'');assert.equal(proposal.address,'');
});
test('valid readable place URL supplies all three fields',()=>{
 const proposal=mergeMapsProposal('https://www.google.com/maps/place/Alfa,+Via+Roma+1,+80100+Napoli+NA/');
 assert.equal(proposal.name,'ALFA');assert.equal(proposal.city,'NAPOLI');assert.equal(proposal.address,'VIA ROMA 1, 80100 NAPOLI NA');
});

test("D'Alterio Group: raw and percent-encoded apostrophes preserve the entire address",()=>{
 for(const label of ["D'Alterio+Group","D%27Alterio+Group"]){
  const url="https://www.google.com/maps/place/"+label+",+Km.+27.200,+SS+265,+81025+Zona+Industriale+Marcianise+Nord+CE/";
  const p=mergeMapsProposal(url);
  assert.equal(p.name,"D'ALTERIO GROUP");
  assert.equal(p.city,"ZONA INDUSTRIALE MARCIANISE NORD");
  assert.equal(p.address,"KM. 27.200, SS 265, 81025 ZONA INDUSTRIALE MARCIANISE NORD CE");
 }
});
test('ordinary street names are not mistaken for postal localities',()=>{
 const p=mergeMapsProposal('https://www.google.com/maps/place/Alfa,+Via+Roma+1,+80100+Via+Verdi+NA/');
 assert.equal(p.city,'');
});
