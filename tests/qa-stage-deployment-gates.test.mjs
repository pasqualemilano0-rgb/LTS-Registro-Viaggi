import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const stage='https://lts-booking-security-stage.pasqualemilano0.workers.dev';
const qa='https://sywxretbfgwxwhvdcknq.supabase.co';
const prod='https://otrqynkscpbeyuvdlgpg.supabase.co';

test('stage runtime uses QA authentication and disables business writes',async()=>{
  const runtime=(await import('../staging/runtime-config.mjs')).default;
  assert.equal(runtime.staging.origin,stage);
  assert.equal(runtime.accountAuth.loginEndpoint,qa+'/functions/v1/lts-phone-auth');
  assert.equal(runtime.apiUrl,null);
  assert.equal(runtime.realtime.enabled,false);
  assert.equal(runtime.staging.productionWritesDisabled,true);
  assert.equal(runtime.staging.backgroundSyncDisabled,true);
  assert.equal(runtime.staging.pushDisabled,true);
  assert.ok(!JSON.stringify(runtime).includes(prod));
});
test('unmodified porti HTML is NOT safe to deploy to QA origin',()=>{
  const html=read('porti/index.html');
  assert.ok(html.includes('https://container-booking-backend.pasqualemilano0.workers.dev'));
  assert.ok(!html.includes('https://lts-tfg-booking-qa-gateway.pasqualemilano0.workers.dev'));
});
test('unmodified root HTML is NOT safe to deploy to QA origin',()=>{
  const html=read('index.html');
  assert.ok(html.includes(prod));
  assert.ok(html.includes('rel="canonical"'));
});
