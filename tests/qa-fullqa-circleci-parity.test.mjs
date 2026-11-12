import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const config=readFileSync(new URL('../.circleci/config.yml',import.meta.url),'utf8');

test('CircleCI executes the full JS syntax and regression gate of the legacy prerelease runner',()=>{
  assert.match(config,/find \. -type f -name '\*\.mjs' ! -path '\.\/node_modules\/\*' -print0 \| xargs -0 -n 1 node --check/);
  assert.match(config,/node --check sw\.js/);
  assert.match(config,/node --test tests\/\*\.test\.mjs/);
  assert.match(config,/- webapp-regression\b/);
});

test('CircleCI executes the entire Python regression suite with the same glob',()=>{
  assert.match(config,/python -m unittest discover -s tests -p 'test_\*\.py' -v/);
  assert.match(config,/- snapshot-publisher-contract\b/);
});

test('Cloudflare and Booking security jobs remain separate required CI jobs',()=>{
  assert.match(config,/- booking-auth-transport\b/);
  assert.match(config,/- cloudflare-publisher-contract\b/);
  assert.match(config,/qa-no-auto-publish\.test\.mjs/);
  assert.match(config,/qa-porti-cloudflare-direct-publisher\.test\.mjs/);
});

test('obsolete GitHub full-qa runner is absent after proven CircleCI parity',()=>{
  assert.equal(existsSync(new URL('../.github/workflows/qa-full-prerelease.yml',import.meta.url)),false);
});

test('CircleCI preserves account live authorization and Maps canonical fixture parity',()=>{
  assert.match(config,/node --test tests\/\*\.test\.mjs/);
  for(const file of ['qa-admin-records-live.test.mjs','qa-maps-reader-live.test.mjs']) {
    assert.ok(existsSync(new URL('tests/'+file,new URL('../',import.meta.url))), 'Missing read-only live auth check: '+file);
  }
  assert.match(config,/node tests\/maps-redirect-diagnostic\.mjs/);
});

test('GitHub account release QA duplicate is absent after CircleCI live parity',()=>{
  assert.equal(existsSync(new URL('../.github/workflows/qa-account-release.yml',import.meta.url)),false);
  assert.match(config,/node tests\/maps-redirect-diagnostic\.mjs/);
  assert.match(config,/node --test tests\/\*\.test\.mjs/);
});
