/** Tests the exact prepared Worker with synthetic Basic credentials and exported KV bytes.
 * This is not an authenticated request to the deployed PWA. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [script,kvFile]=process.argv.slice(2);
const worker=(await import(pathToFileURL(resolve(script)))).default;
const kv=new Map(JSON.parse(readFileSync(kvFile,'utf8')).map(x=>[x.key,Buffer.from(x.value,'base64')]));
const basic=Buffer.from('synthetic-worker-test:only-local').toString('base64');
const env={QA_GATE_SHA256:createHash('sha256').update(basic).digest('hex'),QA_ASSETS:{get:async key=>kv.get(key)||null}};
const origin='https://lts-test-pr205.pasqualemilano0.workers.dev';
const call=(path,headers={},options={})=>worker.fetch(new Request(origin+path,{headers,...options}),env);
assert.equal((await call('/documenti/')).status,401);
assert.equal((await call('/documenti/',{Authorization:'Basic '+Buffer.from('wrong:wrong').toString('base64')})).status,401);
const auth={Authorization:'Basic '+basic};
assert.equal((await call('/__lts_qa_gate',auth)).status,204);
assert.equal((await call('/documenti/',auth,{method:'POST'})).status,405);
assert.equal((await call('/unknown',auth)).status,404);
assert.equal((await call('/documenti',auth)).status,308);
for(const path of ['/documenti/','/documenti/driver-documents.mjs','/documenti/document-api.mjs','/documenti/admin-documents.mjs','/documenti/documents.css','/amministratore/','/amministratore/buste-paga/','/amministratore/admin-area-choice.mjs','/amministratore/admin-area-choice.css','/assets/admin-card-amministrativa.webp','/assets/admin-card-logistica.svg','/assets/admin-hero-napoli.svg','/runtime-config.mjs','/app.mjs']){
 const r=await call(path,auth);
 assert.equal(r.status,200,path);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.match(r.headers.get('content-security-policy'),/frame-src blob:/);
 assert.match(r.headers.get('content-security-policy'),/lts-payroll-secure-qa/);
 assert.doesNotMatch(r.headers.get('content-security-policy'),/otrqynkscpbeyuvdlgpg/);
 assert.equal(Number(r.headers.get('content-length')),(await r.arrayBuffer()).byteLength);
}
const broken={...env,QA_ASSETS:{get:async()=>new Uint8Array([1,2,3])}};
assert.equal((await worker.fetch(new Request(origin+'/documenti/',{headers:auth}),broken)).status,503);
console.log('PASS: 21 exact-artifact scenarios; synthetic Basic, 14 assets, CSP/no-store, corruption rejection.');
