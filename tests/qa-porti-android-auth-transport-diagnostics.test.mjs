import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
test('distinguishes browser fetch transport and auth timeout without guessing CORS',()=>{
 assert.match(app,/error\?\.transportCode==='AUTH-TIMEOUT'/);
 assert.match(app,/error\?\.transportCode==='AUTH-FETCH'/);
 assert.match(app,/LTS_BOOKING_AUTH_FETCH:'AUTH-FETCH'/);
 assert.match(app,/LTS_BOOKING_AUTH_TIMEOUT:'AUTH-TIMEOUT'/);
 assert.match(app,/Fetch failures cannot reliably distinguish TLS, DNS and CORS/);
});
test('safe Android diagnostics never include token, booking number or request URL',()=>{
 assert.match(app,/document\.visibilityState==='hidden'/);
 assert.match(app,/navigator\.onLine===false/);
 assert.match(app,/textBlock\('Codice diagnostico: '\+diagnostic\+connectionHint,'tiny'\)/);
 const block=app.slice(app.indexOf('const authTransportFailure='),app.indexOf('openResults(',app.indexOf('const authTransportFailure=')));
 assert.doesNotMatch(block,/accessToken|booking\b|localStorage|sessionStorage|\.href/);
});
