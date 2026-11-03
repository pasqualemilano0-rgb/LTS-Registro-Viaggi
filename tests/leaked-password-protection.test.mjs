import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

globalThis.crypto ??= webcrypto;
const web=readFileSync(new URL('../recupera-password.mjs',import.meta.url),'utf8');
const policy=web.match(/^function validPassword\(s\)\{[\s\S]*?^\}/m)?.[0];
const checker=web.match(/^export async function compromisedPassword\(password,fetchImpl=fetch\)\{[\s\S]*?^\}/m)?.[0];
assert.ok(policy&&checker,'Password protections must remain present in the browser recovery module.');
const {validPassword,compromisedPassword}=await import('data:text/javascript;base64,'+
  Buffer.from('export '+policy+'\n'+checker).toString('base64'));

test('Gmail password recovery matches server-side length, format and control-character constraints',()=>{
 assert.equal(validPassword('Correct-Horse-42'),true);
 assert.equal(validPassword(' Correct-Horse-42'),false);
 assert.equal(validPassword('Correct-Horse-42 '),false);
 assert.equal(validPassword('Correct-\nHorse-42'),false);
 assert.equal(validPassword('Correct-\u007fHorse-42'),false);
 assert.equal(validPassword('Ab1def'),false);
 assert.equal(validPassword('OnlyLettersHere'),false);
 assert.equal(validPassword('123456789012345'),false);
 assert.equal(validPassword('A1'.repeat(65)),false);
});

test('HIBP browser check uses only 5 SHA-1 hex digits and blocks known exposed password',async()=>{
 const requests=[];
 const matched=await compromisedPassword('password',async(url,options)=>{
   requests.push({url,options});
   return {ok:true,status:200,text:async()=>[
     '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9000000',
     '0'.repeat(35)+':0'
   ].join('\r\n')};
 });
 assert.equal(matched,true);
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'https://api.pwnedpasswords.com/range/5BAA6');
 assert.equal(new URL(requests[0].url).pathname,'/range/5BAA6');
 assert.ok(!requests[0].url.includes('5BAA61E4C'));
 assert.equal(requests[0].options.method,'GET');
 assert.equal(requests[0].options.credentials,'omit');
 assert.equal(requests[0].options.cache,'no-store');
 assert.equal(requests[0].options.headers['Add-Padding'],'true');
});
test('HIBP no match is allowed, malformed/unavailable checks fail closed',async()=>{
 const clean=await compromisedPassword('Correct-Horse-42',async()=>({
   ok:true,status:200,text:async()=>'0'.repeat(35)+':0\r\n'+'A'.repeat(35)+':17'
 }));
 assert.equal(clean,false);
 for(const fetchImpl of [
   async()=>{throw Error('Network offline');},
   async()=>({ok:false,status:503}),
   async()=>({ok:true,status:200,text:async()=>''}),
   async()=>({ok:true,status:200,text:async()=>'malformed payload'}),
   async()=>({ok:true,status:200,text:async()=>'0'.repeat(350001)})
 ]){
   await assert.rejects(compromisedPassword('Correct-Horse-42',fetchImpl),
     /Verifica sicurezza password non disponibile/);
 }
});
test('password changes remain gated by breach check before a Supabase password update',()=>{
 const check=web.indexOf('if(await compromisedPassword(pass))');
 const change=web.indexOf("const user=await requestApi('user',{method:'PUT',body:{password:pass},token:recoveryToken})");
 assert.ok(check>0&&change>check,'Browser recovery must check breach exposure before password update.');
 assert.match(web,/if\(pass!==confirm\)/);
});
