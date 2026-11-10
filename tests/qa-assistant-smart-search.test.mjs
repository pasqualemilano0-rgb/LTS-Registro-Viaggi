import test from 'node:test';
import assert from 'node:assert/strict';
import {smartCustomerSearch,interpretGuidedMessage} from '../copilota/guided.mjs';
const customers=[{name:'De Matteis',city:'Napoli'},{name:'De Martino',city:'Caserta'},{name:'Acetificio Milano',city:'Salerno'}];
test('fuzzy customer name and case insensitive lookup',()=>{assert.equal(smartCustomerSearch(customers,'de mateis')[0].name,'De Matteis');assert.equal(smartCustomerSearch(customers,'MILANO')[0].name,'Acetificio Milano');});
test('never invent customers when no matches',()=>{assert.deepEqual(smartCustomerSearch(customers,'azienda inesistente'),[]);});
test('guided trip command extracts container without saving',()=>{assert.deepEqual(interpretGuidedMessage('Inserisci viaggio per De Matteis MSDU3456768'),{intent:'trip',customer:'De Matteis',container:'MSDU3456768'});});
