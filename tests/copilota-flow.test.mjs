import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeContainer,validContainer,searchCustomers,prepareCustomerRequest,prepareTripReview} from '../copilota/flow.mjs';
test('normalizes container without sending anything',()=>{assert.equal(normalizeContainer(' mscu 1234567 '),'MSCU1234567');assert.equal(validContainer('MSCU1234567'),true);assert.equal(validContainer('MSCU12345'),false);});
test('customer search reuses LTS prefix matching',()=>{const list=[{name:'ALFA',city:'Napoli'},{name:'BETA',city:'Caserta'}];assert.deepEqual(searchCustomers(list,'a').map(x=>x.name),['ALFA']);});
test('new customer is proposal only',()=>{const p=prepareCustomerRequest({container:'MSCU1234567',customerName:'Nuovo cliente'});assert.equal(p.status,'not_sent');assert.equal(p.type,'customer_approval_proposal');});
test('trip review never writes',()=>{const p=prepareTripReview({container:'MSCU1234567',customer:{name:'ALFA',city:'Napoli'}});assert.equal(p.status,'draft_only');});
test('rejects missing customer',()=>assert.throws(()=>prepareTripReview({container:'MSCU1234567'})));
