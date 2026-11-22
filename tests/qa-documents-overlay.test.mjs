import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareDocumentsQa} from '../scripts/prepare-documents-qa.mjs';
function fixture(qa=true){
 const dir=mkdtempSync(join(tmpdir(),'lts-payroll-qa-overlay-'));
 mkdirSync(join(dir,'amministratore'),{recursive:true});
 writeFileSync(join(dir,'runtime-config.mjs'),`if(globalThis.location?.origin!=="${qa?'https://lts-test-pr205.pasqualemilano0.workers.dev':'https://pasqualemilano0-rgb.github.io'}")throw Error("wrong origin");
export default {"environment": "qa","accountAuth":{"loginEndpoint": "https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-phone-auth","adminRecordsEndpoint": "https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-admin-records"}};`);
 writeFileSync(join(dir,'app.mjs'),"const syncInfo=store.getSyncInfo();\n  const syncInfo=store.getSyncInfo();".replace("const syncInfo=store.getSyncInfo();\n",""));
 writeFileSync(join(dir,'amministratore/index.html'),'<head></head><header>QA header</header>\n  <main class="container">      <form id="login-form"></form>      <div class="login-footer"></div>');
 return dir;
}
test('QA overlay binds PDF endpoint to QA login, keeps production source untouched',()=>{
 const dir=fixture();
 try{
  const result=prepareDocumentsQa(dir);
  assert.equal(result.workerCspRequired,true);
  assert.equal(result.files.length,15);
  assert.match(readFileSync(join(dir,'runtime-config.mjs'),'utf8'),/lts-payroll-secure-qa/);
  assert.match(readFileSync(join(dir,'app.mjs'),'utf8'),/I MIEI DOCUMENTI/);
  assert.match(readFileSync(join(dir,'documenti/index.html'),'utf8'),/sywxretbfgwxwhvdcknq.supabase.co/);
  assert.doesNotMatch(readFileSync(join(dir,'documenti/index.html'),'utf8'),/otrqynkscpbeyuvdlgpg/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('QA overlay rejects production origin before writing files',()=>{
 const dir=fixture(false);
 try{assert.throws(()=>prepareDocumentsQa(dir),/Refused/);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
