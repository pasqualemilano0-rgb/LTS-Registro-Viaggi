import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../staging/android/'+p,import.meta.url),'utf8');
test('QA Android frontend has no production service or storage references',()=>{
 for(const path of ['index.html','app.mjs','manifest.webmanifest']){
  const s=read(path);
  for(const forbidden of ['otrqynkscpbeyuvdlgpg','container-booking-backend','localStorage','sessionStorage','indexedDB','serviceWorker','api/public-state'])assert.ok(!s.includes(forbidden),path+' contains '+forbidden);
 }
});
test('QA Android auth remains mandatory and admin MFA fail-closed',()=>{
 const s=read('app.mjs');
 assert.match(s,/await verify\(\);\s*const data=await post\(BOOKING/);
 assert.match(s,/state\.role==='admin'&&state\.mfa_verified!==true/);
 assert.match(s,/credentials:'omit'/);
 assert.match(s,/expiresAt=Date\.now\(\)\+data\.expires_in\*1000/);
});
test('QA Android manifest is scoped and installable shell is isolated',()=>{
 const m=JSON.parse(read('manifest.webmanifest'));
 assert.equal(m.display,'standalone');
 assert.equal(m.start_url,'./');
 assert.equal(m.scope,'./');
 assert.match(read('index.html'),/Content-Security-Policy/);
 assert.ok(read('icon.svg').startsWith('<svg'));
});
