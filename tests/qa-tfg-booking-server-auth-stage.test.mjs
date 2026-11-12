import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../porti/app.js',import.meta.url),'utf8');
const start=source.indexOf('export async function getBookingBearerForServerVerification(){');
const end=source.indexOf('\n/** Authenticated Realtime channels',start);
assert.ok(start>=0&&end>start);
const method=source.slice(start,end).replace(/^export /,'');
function scenario(stored,verified=false){
 let refreshed=0;
 const ctx={readStored:()=>stored,isVerified:()=>verified,
  refresh:async()=>{refreshed++;stored={...stored,access_token:'ROTATED',expires_at:Date.now()+60000};},
  Date,Error};
 vm.runInNewContext(method+'\nthis.get=getBookingBearerForServerVerification;',ctx);
 return {get:ctx.get,refreshed:()=>refreshed};
}
test('valid driver bearer avoids redundant browser Supabase session fetch',async()=>{
 const x=scenario({role:'driver',access_token:'DRIVER',expires_at:Date.now()+60000});
 assert.equal(await x.get(),'DRIVER');assert.equal(x.refreshed(),0);
});
test('expired driver token is refreshed before sending to Worker',async()=>{
 const x=scenario({role:'driver',access_token:'OLD',expires_at:Date.now()-1});
 assert.equal(await x.get(),'ROTATED');assert.equal(x.refreshed(),1);
});
test('missing session is denied',async()=>{
 const x=scenario(null);await assert.rejects(x.get(),/accesso/);
});
test('admin pending MFA denied even with unexpired token',async()=>{
 const x=scenario({role:'admin',access_token:'ADMIN',expires_at:Date.now()+60000});
 await assert.rejects(x.get(),/amministratore/);
});
test('booking still requires Worker Authorization and handles 401/403/429',()=>{
 assert.match(app,/getBookingBearerForServerVerification\(\)/);
 assert.match(app,/Authorization:'Bearer '\+accessToken/);
 assert.match(app,/response.status===401\)throw Error\('LTS_BOOKING_LOGIN_REQUIRED'\)/);
 assert.match(app,/response.status===403\)throw Error\('LTS_BOOKING_ACCESS_DENIED'\)/);
 assert.match(app,/TFG_RATE_LIMITED/);
});
