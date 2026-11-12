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
 const meta=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
 assert.ok(meta,'Porti must retain its own restrictive CSP');
 const directives=meta[1].split(';').map(value=>value.trim());
 const connect=directives.find(value=>value.startsWith('connect-src '));
 assert.ok(connect,'Porti must have an explicit connect-src directive');
 assert.match(connect,/(?:^|\\s)https:\/\/otrqynkscpbeyuvdlgpg\\.supabase\\.co(?:\\s|$)/);
 assert.match(connect,/(?:^|\\s)https:\/\/container-booking-backend\\.pasqualemilano0\\.workers\\.dev(?:\\s|$)/);
 assert.doesNotMatch(connect,/\\*/,'Do not loosen outbound requests with a wildcard');
 assert.doesNotMatch(connect,/sywxretbfgwxwhvdcknq/,'QA auth must not leak into production');
 assert.ok(directives.includes("script-src 'self'"));
 assert.ok(directives.includes("object-src 'none'"));
 assert.match(auth,/result\\.hostname!=='otrqynkscpbeyuvdlgpg\\.supabase\\.co'/);
 assert.match(app,/import \\{getVerifiedAccessToken\\} from '\\.\\.\\/account-access\\.mjs'/);
});
