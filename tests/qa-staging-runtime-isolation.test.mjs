import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import config from '../staging/runtime-config.mjs';
const PROD=/otrqynkscpbeyuvdlgpg|container-booking-backend|lts-registro-viaggi-iphone|pasqualemilano0-rgb\\.github\\.io/;
test('QA runtime config has no production origin or backend',async()=>{
 const raw=await readFile(new URL('../staging/runtime-config.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(raw,PROD);
 assert.equal(config.apiUrl,null);
 assert.equal(config.deviceToken,false);
 assert.equal(config.realtime.enabled,false);
 assert.equal(config.staging.productionWritesDisabled,true);
 assert.equal(config.staging.bookingApiEnabled,false);
});
test('every configured account endpoint is QA Supabase only',()=>{
 for(const [key,value] of Object.entries(config.accountAuth)){
  if(key==='enabled'||value===null)continue;
  const endpoint=new URL(value);
  assert.equal(endpoint.protocol,'https:');
  assert.equal(endpoint.hostname,'sywxretbfgwxwhvdcknq.supabase.co');
  assert.match(endpoint.pathname,/^\/functions\/v1\/lts-[a-z-]+$/);
  assert.equal(endpoint.search,'');
  assert.equal(endpoint.hash,'');
 }
});
