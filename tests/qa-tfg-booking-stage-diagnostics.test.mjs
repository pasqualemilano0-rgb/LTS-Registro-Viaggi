import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
const booking=readFileSync(new URL('../porti/tfg_booking.mjs',import.meta.url),'utf8');
test('auth session remains mandatory before gateway fetch',()=>{
 assert.match(app,/accessToken=await getVerifiedAccessToken\(\)/);
 assert.match(app,/Authorization:'Bearer '\+accessToken/);
 assert.match(app,/response\.status===401\)throw Error\('LTS_BOOKING_LOGIN_REQUIRED'\)/);
 assert.match(app,/response\.status===403\)throw Error\('LTS_BOOKING_ACCESS_DENIED'\)/);
});
test('auth and gateway transport errors are not conflated',()=>{
 assert.match(app,/serviceUnavailable===true\)throw Error\(error\?\.authTransportCode==='AUTH-TIMEOUT'\?'LTS_BOOKING_AUTH_TIMEOUT':'LTS_BOOKING_AUTH_NETWORK'\)/);
 assert.match(app,/throw Error\('TFG_GATEWAY_NETWORK'\)/);
 assert.match(booking,/throw Error\('TFG_GATEWAY_NETWORK'\)/);
 assert.match(booking,/TFG_GATEWAY_5XX':'TFG_GATEWAY_4XX'/);
});
test('diagnostic codes are fixed and do not contain booking or tokens',()=>{
 for(const code of ['AUTH-FETCH','AUTH-TIMEOUT','AUTH-503','TFG-NETWORK','TFG-HTTP5','TFG-TIMEOUT','TFG-FORMAT']){
  assert.ok(app.includes("'"+code+"'"));
 }
 assert.match(app,/results\.append\(textBlock\('Codice diagnostico: '\+diagnostic,'tiny'\)\)/);
 assert.doesNotMatch(app,/console\.(log|error)\(.*accessToken/);
});
test('TFG API retains strict response validation and rate limiting',()=>{
 assert.match(booking,/response\.status===429\)throw Error\('TFG_RATE_LIMITED'\)/);
 assert.match(booking,/raw\.booking_authorized!==false/);
 assert.match(booking,/raw\.source!==TFG_BOOKING_SOURCE/);
 assert.match(booking,/body\.length>5000/);
});
