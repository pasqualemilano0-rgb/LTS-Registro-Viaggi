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


test('embedded Porti CSP explicitly allows production Supabase session verification',()=>{
 const html=readFileSync(new URL('../porti/index.html',import.meta.url),'utf8');
 const auth=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
 const meta=html.split('\n').find(line=>line.includes('http-equiv="Content-Security-Policy"'));
 assert.ok(meta,'Porti must retain its own restrictive CSP');
 const connect=meta.split('connect-src ')[1]?.split(';')[0]||'';
 const origins=new Set(connect.trim().split(' '));
 assert.ok(origins.has('https://otrqynkscpbeyuvdlgpg.supabase.co'),'Production Supabase must be permitted by iframe CSP');
 assert.ok(origins.has('https://container-booking-backend.pasqualemilano0.workers.dev'));
 assert.ok(!origins.has('*'),'Do not permit wildcard endpoints');
 assert.ok(!origins.has('https://sywxretbfgwxwhvdcknq.supabase.co'),'No QA auth in production');
 assert.ok(meta.includes("script-src 'self'"));
 assert.ok(meta.includes("object-src 'none'"));
 assert.ok(auth.includes("result.hostname!=='otrqynkscpbeyuvdlgpg.supabase.co'"));
 assert.ok(app.includes("import {getVerifiedAccessToken} from '../account-access.mjs';"));
});
