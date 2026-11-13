import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const circle=readFileSync(new URL('.circleci/config.yml',root),'utf8');
const image='mcr.microsoft.com/playwright:v1.56.1-noble@sha256:42f02d323c310069b4d54c94bd91a608966a486c3492c48ae0b1cea747ec5ca2';
const browser=circle.slice(circle.indexOf('  browser-report-parity:\n'));

test('Pinned Playwright for Chromium and WebKit, no macOS runner',()=>{
  assert.ok(browser.startsWith('  browser-report-parity:\n'));
  assert.ok(browser.includes('image: '+image));
  assert.match(browser,/resource_class: medium/);
  assert.match(browser,/playwright@1\.56\.1/);
  assert.match(browser,/const b of \['chromium','webkit'\]/);
  assert.doesNotMatch(browser,/(macos|setup_remote_docker|sudo .*npm|github\.token)/);
});
test('Browser job retains all Chromium checks from GitHub release QA',()=>{
  for(const name of [
    'company-report-browser.mjs','control-center-browser.mjs','qa-register-browser.mjs',
    'qa-offline-worker-browser.mjs','qa-admin-installable-browser.mjs',
    'qa-offline-store-browser.mjs','qa-store-cas-browser.mjs'
  ]){
    assert.ok(existsSync(new URL('tests/'+name,root)));
    assert.ok(browser.includes('node tests/'+name),'Missing Chromium '+name);
  }
  assert.match(browser,/control-center-chromium\.json/);
});
test('Safari WebKit job retains all mobile and offline checks',()=>{
  assert.match(browser,/export LTS_BROWSER_ENGINE=webkit/);
  const webkit=browser.slice(browser.indexOf('name: Safari WebKit mobile'));
  assert.ok(webkit.includes('control-center-webkit.json'));
  for(const name of ['company-report-browser.mjs','control-center-browser.mjs',
    'qa-register-browser.mjs','qa-offline-store-browser.mjs','qa-store-cas-browser.mjs']){
    assert.ok(webkit.includes('node tests/'+name),'Missing WebKit '+name);
  }
});
test('Read-only production smoke and synthetic evidence remain',()=>{
  assert.match(browser,/node tests\/qa-report-production-http-smoke\.mjs/);
  assert.ok(existsSync(new URL('tests/qa-report-production-http-smoke.mjs',root)));
  assert.match(browser,/store_artifacts:/);
  assert.match(browser,/lts-browser-synthetic-evidence/);
});
test('Expensive browser job does not start on every main Porti data commit',()=>{
  const workflow=circle.split('  browser-release-parity:\n')[1].split('\njobs:\n')[0];
  assert.match(workflow,/browser-report-parity:/);
  assert.match(workflow,/branches:\n\s+only:/);
  assert.match(workflow,/ci\\\/browser-parity/);
  assert.match(workflow,/release\\\//);
  assert.doesNotMatch(workflow,/^\s+- main\s*$/m);
});
