import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const BASE='/LTS-Registro-Viaggi/',origin='https://example.test';
const driver=JSON.parse(read('manifest.webmanifest')),admin=JSON.parse(read('amministratore/manifest.webmanifest'));
test('PWA scopes are disjoint while preserving the original driver identity and origin',()=>{
 assert.equal(driver.id,BASE);
 assert.equal(driver.start_url,BASE+'viaggi/');
 assert.equal(driver.scope,driver.start_url);
 assert.equal(admin.start_url,BASE+'amministratore/');
 assert.equal(admin.scope,admin.start_url);
 assert.equal(driver.scope.startsWith(admin.scope),false);
 assert.equal(admin.scope.startsWith(driver.scope),false);
 assert.equal(driver.start_url.startsWith(driver.scope),true);
 assert.equal(admin.start_url.startsWith(admin.scope),true);
});
test('scoped HTML uses the same audited register and document modules without code duplication',()=>{
 const legacy=read('index.html'),scoped=read('viaggi/index.html');
 assert.equal(scoped,legacy.replaceAll('https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/">','https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/viaggi/">'));
 const documents=read('documenti/index.html'),newDocuments=read('viaggi/documenti/index.html');
 assert.equal(newDocuments,documents.replaceAll('href="../assets/','href="../../assets/').replaceAll('src="../assets/','src="../../assets/').replace('href="./documents.css','href="../../documenti/documents.css').replace('src="./driver-documents.mjs','src="../../documenti/driver-documents.mjs'));
 for(const match of newDocuments.matchAll(/(?:href|src)="([^"]+)"/g)){
  const target=new URL(match[1],origin+driver.scope+'documenti/');
  if(match[1]==='../')assert.equal(target.pathname,driver.scope);
  else if(target.origin===origin)assert.ok(existsSync(new URL('../'+target.pathname.slice(BASE.length),import.meta.url)),target.pathname);
 }
 assert.match(read('app.mjs'),/target\.pathname='\/LTS-Registro-Viaggi\/viaggi\/documenti\/'/);
 assert.match(read('app.mjs'),/new URL\('viaggi\/',import\.meta\.url\)/);
});
test('driver worker never substitutes the register for admin, legacy admin or documents',async()=>{
 let handler;
 const hits=[];
 const worker={location:{origin},addEventListener(type,fn){if(type==='fetch')handler=fn;}};
 vm.runInNewContext(read('sw.js'),{self:worker,URL,Response,fetch:async()=>{throw Error('offline')},
  caches:{match:async path=>{hits.push(path);return new Response(path)}}});
 function request(path){
  let response;
  handler({request:{url:origin+BASE+path,method:'GET',mode:'navigate'},respondWith(v){response=v}});
  return response;
 }
 for(const route of ['amministratore','amministratore/','amministratore/buste-paga/','status/','documenti','documenti/','viaggi/documenti','viaggi/documenti/']){
  assert.equal(request(route),undefined,route);
 }
 assert.deepEqual(hits,[]);
 for(const route of ['viaggi/','viaggi/index.html']){
  const response=await request(route);
  assert.equal(await response.text(),BASE+'viaggi/index.html');
 }
 assert.equal(await (await request('')).text(),BASE+'index.html');
 const unknown=await request('unknown/');
 assert.equal(unknown.type,'error');
});
test('notification navigation targets only the driver entry and never Admin',()=>{
 const push=read('push-worker.js');
 assert.match(push,/new URL\('viaggi\/', scope\)/);
 assert.match(push,/target\.pathname,target\.pathname\+'index\.html'/);
 assert.doesNotMatch(push,/amministratore\//);
});
