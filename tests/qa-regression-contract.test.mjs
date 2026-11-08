import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const driver=read('amministratore/driver-records.mjs');
const review=read('amministratore/personal-customer-certification.mjs');
const maps=read('amministratore/personal-customer-maps-ui.mjs');
const intelligence=read('amministratore/records-intelligence.mjs');
test('client merge must validate the shared site before audited deletion',()=>{
 assert.match(maps,/await\s+sharedMapsCustomers\(\)/);
 assert.match(maps,/reviewPersonalCustomerCertification/);
 assert.match(maps,/await\s+saveSharedMapsCustomer\(/);
 assert.match(maps,/checked[.]checked/);
 assert.match(maps,/const done=await removePersonal\(/);
 assert.match(driver,/removePersonal:reason=>mutate\(\{operation:'delete',category:'customer'/);
 assert.match(driver,/openDeleteConfirmation\(item,card,actions\)/);
 assert.match(review,/normalizedStreetKey/);
 assert.doesNotMatch(maps,/\.innerHTML\s*=|document\.write\(/);
});
test('customer worklist is read-only; history and prices are not silently modified',()=>{
 assert.match(intelligence,/assessPersonalCustomer/);
 assert.match(intelligence,/archiveCustomerMetrics/);
 assert.match(intelligence,/tripAmounts/);
 assert.match(driver,/customerMatchesQuickFilter/);
 assert.match(driver,/cachedTripSummary/);
 assert.match(driver,/invalidateDerived\(\)/);
 assert.doesNotMatch(intelligence,/await\s+\w+\(|\bfetch\s*\(|localStorage|\.innerHTML\s*=/);
});
