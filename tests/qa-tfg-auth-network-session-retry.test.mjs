import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const porti=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
const block=src.slice(src.indexOf('export async function getVerifiedAccessToken(){'),src.indexOf('/** Booking transport'));
test('Booking auth still requires verified live session and MFA',()=>{
 assert.match(block,/await verifySession\(\)/);
 assert.match(block,/if\(!isVerified\(\)\)throw/);
 assert.match(porti,/accessToken=await getBookingBearerForServerVerification\(\)/);
});
test('only transient network errors retry; refresh and access denial never retry',()=>{
 assert.match(block,/if\(error\?\.serviceUnavailable!==true\)throw error/);
 assert.match(block,/current\.expires_at<Date\.now\(\)\+15000\)throw error/);
 assert.match(block,/await verifySession\(\)/);
 assert.doesNotMatch(block,/await refresh\(/);
});
test('concurrent booking checks share in-flight verification and clean up',()=>{
 assert.match(block,/if\(bookingSessionVerification\)return bookingSessionVerification/);
 assert.match(block,/bookingSessionVerification=task/);
 assert.match(block,/finally\{if\(bookingSessionVerification===task\)bookingSessionVerification=null/);
});
test('CORS remains strict and authentication endpoint pinned',()=>{
 assert.ok(src.includes("result.hostname==='otrqynkscpbeyuvdlgpg.supabase.co'"));
 assert.ok(src.includes("result.hostname==='sywxretbfgwxwhvdcknq.supabase.co'"));
 assert.ok(src.includes("globalThis.location?.origin==='https://lts-booking-security-stage.pasqualemilano0.workers.dev'"));
 assert.match(src,/mode:'cors'/);
 assert.match(src,/redirect:'error'/);
});
