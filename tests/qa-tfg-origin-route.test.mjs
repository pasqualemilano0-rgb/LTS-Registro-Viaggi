import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tfgBookingEndpoint,TFG_BOOKING_API,TFG_BOOKING_QA_API,TFG_BOOKING_STAGE_ORIGIN,lookupTfgBooking} from '../porti/tfg_booking.mjs';

test('exact QA origin selects isolated gateway, not production',()=>{
  assert.equal(tfgBookingEndpoint(TFG_BOOKING_STAGE_ORIGIN),TFG_BOOKING_QA_API);
  assert.equal(tfgBookingEndpoint('https://pasqualemilano0-rgb.github.io'),TFG_BOOKING_API);
  assert.notEqual(TFG_BOOKING_QA_API,TFG_BOOKING_API);
});
test('staging requests never fall back to production on QA failure',async()=>{
  const old=globalThis.location;
  try{
    globalThis.location={origin:TFG_BOOKING_STAGE_ORIGIN};
    const calls=[];
    await assert.rejects(lookupTfgBooking('280630439',async(url)=>{
      calls.push(url);throw Error('QA unreachable');
    }),/TFG_GATEWAY_NETWORK/);
    assert.deepEqual(calls,[TFG_BOOKING_QA_API]);
  }finally{
    if(old===undefined)delete globalThis.location;
    else globalThis.location=old;
  }
});
test('UI callback enforces same origin-selected endpoint',()=>{
  const source=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
  assert.match(source,/endpoint!==tfgBookingEndpoint\(\)/);
  assert.match(source,/Authorization:'Bearer '\+accessToken/);
});
