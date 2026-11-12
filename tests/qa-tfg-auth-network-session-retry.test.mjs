import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const porti=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
const block=src.slice(src.indexOf('export async function getVerifiedAccessToken(){'),src.indexOf('/** Authenticated Realtime'));
test('Booking auth still requires verified live session and MFA',()=>{
 assert.match(block,/await verifySession\(\)/);
 assert.match(block,/if\(isVerified\(\)&&existing\?\.access_token&&existing\.expires_at>Date\.now\(\)\+60000\)/);
 assert.match(block,/if\(!isVerified\(\)\)throw/);
 assert.match(porti,/accessToken=await getVerifiedAccessToken\(\)/);
});
test('only transient network errors retry; refresh and access denial never retry',()=>{
 assert.match(block,/if\(error\?\.serviceUnavailable!==true\|\|attempt===2\)throw error/);
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
 assert.match(src,/result\.hostname!=='otrqynkscpbeyuvdlgpg\.supabase\.co'/);
 assert.match(src,/mode:'cors'/);
 assert.match(src,/redirect:'error'/);
});

test('verified session fast path retains server authorization and expiry margin',()=>{
 assert.match(block,/const existing=readStored\(\)/);
 assert.match(block,/if\(isVerified\(\)&&existing\?\.access_token&&existing\.expires_at>Date\.now\(\)\+60000\)/);
 assert.match(block,/return existing\.access_token/);
 assert.match(porti,/Authorization:'Bearer '\+accessToken/);
});
