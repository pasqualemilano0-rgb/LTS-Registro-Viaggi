import test from 'node:test';
import assert from 'node:assert/strict';

/** Server-only smoke check: no private credentials, no personal customer data.
 * Verify that a mobile browser's exact CORS preflight reaches the reader.
 * Do not claim Maps place parsing works from this connectivity-only test.
 */
const url='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-maps-reader';
const origin='https://pasqualemilano0-rgb.github.io';
test('Maps reader accepts browser preflight, and anonymous POST is denied',async()=>{
 const preflight=await fetch(url,{
  method:'OPTIONS',
  headers:{
   Origin:origin,
   'Access-Control-Request-Method':'POST',
   'Access-Control-Request-Headers':'authorization,content-type'
  },signal:AbortSignal.timeout(12000),redirect:'manual'
 });
 assert.equal(preflight.status,204,'OPTIONS must succeed before the phone can POST');
 assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 assert.match(preflight.headers.get('access-control-allow-headers')||'',/Authorization/i);
 const denied=await fetch(url,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({url:'https://maps.app.goo.gl/example'}),
  signal:AbortSignal.timeout(12000),redirect:'manual'
 });
 assert.equal(denied.status,401,'Unauthenticated calls must not read Google Maps');
 assert.equal(denied.headers.get('access-control-allow-origin'),origin);
 const payload=await denied.json();
 assert.equal(typeof payload.error,'string');
});
