import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const auth=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const porti=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
test('auth still verifies session before issuing booking bearer',()=>{
 assert.match(auth,/export async function getVerifiedAccessToken\(\)\{\s*await verifySession\(\)/);
 assert.match(auth,/if\(!isVerified\(\)\)throw/);
 assert.match(porti,/accessToken=await getVerifiedAccessToken\(\)/);
 assert.match(porti,/Authorization:'Bearer '\+accessToken/);
});
test('confirmed offline is distinguished from a failed fetch',()=>{
 assert.match(auth,/if\(navigator\.onLine===false\)\{[\s\S]*?e\.offline=true;throw e;/);
 assert.match(auth,/catch\{\s*const e=new Error\('Servizio account temporaneamente non raggiungibile\.'\);[\s\S]*?e\.serviceUnavailable=true;e\.status=503;throw e;/);
});
test('TFG Booking displays unavailable service rather than offline on auth fetch failure',()=>{
 assert.match(porti,/if\(error\?\.serviceUnavailable===true\)throw Error\('LTS_BOOKING_AUTH_NETWORK'\)/);
 assert.match(porti,/if\(error\?\.status>=500\)throw Error\('LTS_BOOKING_AUTH_UNAVAILABLE'\)/);
 assert.match(porti,/const offline=error\?\.message==='LTS_BOOKING_OFFLINE'/);
 assert.match(porti,/offline\?'CONNESSIONE ASSENTE'/);
});
test('denied sessions and rate limits remain distinct',()=>{
 assert.match(porti,/response\.status===401\)throw Error\('LTS_BOOKING_LOGIN_REQUIRED'\)/);
 assert.match(porti,/response\.status===403\)throw Error\('LTS_BOOKING_ACCESS_DENIED'\)/);
 assert.match(porti,/error\?\.message==='TFG_RATE_LIMITED'/);
});
