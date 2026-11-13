import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRelevant,shouldRunBrowser} from '../scripts/ci-browser-change-gate.mjs';

test('snapshot-only Porti commits do not request medium browser Docker',()=>{
  for(const p of [
    'porti/data/conateco.json','porti/data/sct.json','porti/data/tfg_schedule.json',
    'docs/porti/FASE3_CLOUDFLARE_PUBLISHER.md','README.md','docs/architecture/notes.md'
  ]) assert.equal(browserRelevant(p),false,p);
  assert.equal(shouldRunBrowser(['porti/data/conateco.json','porti/data/sct.json'],{branch:'docs/snapshot-only'}),false);
});
test('application, admin, security, PWA, tests and CI source changes run both browsers',()=>{
  for(const p of [
    'amministratore/admin.mjs','amministratore/report-insights.mjs',
    'account-access.mjs','driver-session-vault.mjs','sw.js','index.html','shell.html',
    'client-store.mjs','shared/company-extras.mjs','shared/register-explorer.mjs',
    'supabase/functions/lts-phone-auth/index.ts',
    'server/admin-records-core.mjs','tests/company-report-browser.mjs',
    'tests/qa-offline-store-browser.mjs',
    'pro-theme.css','.circleci/config.yml','scripts/ci-browser-change-gate.mjs',
    'porti/tfg_booking.mjs','porti/data/new-sensitive-schema.json',
  ]) {
    assert.equal(browserRelevant(p),true,p);
    assert.equal(shouldRunBrowser([p],{branch:'feature/administrative-improvements'}),true,p);
  }
});
test('mixed docs and app changes run browser QA, regardless of order',()=>{
  assert.equal(shouldRunBrowser(['docs/readme.md','index.html'],{branch:'fix/dashboard'}),true);
  assert.equal(shouldRunBrowser(['index.html','docs/readme.md'],{branch:'fix/dashboard'}),true);
});
test('unknown diff always runs browser QA; release branch always runs it',()=>{
  assert.equal(shouldRunBrowser(null,{branch:'feature/new-dashboard'}),true);
  assert.equal(shouldRunBrowser(undefined,{branch:'feature/new-dashboard'}),true);
  assert.equal(shouldRunBrowser([],{branch:'release/lts-webapp'}),true);
  assert.equal(shouldRunBrowser(['docs/release.md'],{branch:'release/lts-webapp'}),true);
});
test('non-relevant branches can stop early, but source test changes cannot',()=>{
  assert.equal(shouldRunBrowser([],{branch:'docs/only'}),false);
  assert.equal(shouldRunBrowser(['docs/guide.md','.gitignore'],{branch:'docs/only'}),false);
  assert.equal(shouldRunBrowser(['tests/qa-circleci-report-browser-parity.test.mjs'],{branch:'ci/browser-path-gate'}),true);
  assert.equal(browserRelevant(''),true);
  assert.equal(browserRelevant('../unexpected.js'),true);
});
