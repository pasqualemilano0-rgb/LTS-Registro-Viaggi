import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const ci=readFileSync(new URL('.circleci/config.yml',root),'utf8');
const absent=['.github/workflows/qa-porti-maintenance.yml','.github/workflows/qa-tfg-booking-offline.yml'];
test('duplicate Porti/TFG PR-triggered GitHub runners are retired',()=>{
  for(const file of absent) assert.equal(existsSync(new URL(file,root)),false,file+' should be retired');
});
test('CircleCI retains Porti maintenance, stale-cache and auth transport safety checks',()=>{
  assert.match(ci,/- booking-auth-transport\b/);
  assert.match(ci,/- webapp-regression\b/);
  for(const js of ['account-access.mjs','driver-session-vault.mjs','porti-access.mjs','porti/app.js','porti/tfg_booking.mjs']) {
    assert.ok(ci.includes('node --check '+js), 'Missing JS syntax: '+js);
  }
  for(const file of [
    'tests/test_porti_maintenance.mjs',
    'tests/qa-porti-stale-cache.test.mjs',
    'tests/qa-account-release.test.mjs',
    'tests/driver-session-vault.test.mjs',
    'tests/leaked-password-protection.test.mjs',
    'tests/qa-driver-refresh-vault-freshness.test.mjs',
    'tests/qa-tfg-auth-network-session-retry.test.mjs',
    'tests/qa-tfg-booking-stage-diagnostics.test.mjs',
    'tests/qa-tfg-booking-offline-diagnostics.test.mjs',
  ]) {
    assert.ok(ci.includes(file), 'Missing CircleCI regression: '+file);
  }
});
