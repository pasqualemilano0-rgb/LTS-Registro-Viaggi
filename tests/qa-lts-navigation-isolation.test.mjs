import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('driver entry never redirects to the administrator app or links it in the profile',()=>{
 const app=read('app.mjs');
 assert.doesNotMatch(app,/location\.(?:assign|replace)\(new URL\('amministratore\//);
 assert.doesNotMatch(app,/menuButton\('Gestisci autisti'/);
 assert.match(app,/if\(logged\.role==='admin'&&logged\.mfa_enrolled&&!logged\.mfa_verified\)\{\s*renderAccountGate\(/);
});
test('driver service worker leaves all administrator and legacy admin status requests untouched',()=>{
 const origin='https://example.test',base='/LTS-Registro-Viaggi/';
 let handler;
 const self={location:{origin},addEventListener(type,fn){if(type==='fetch')handler=fn;}};
 vm.runInNewContext(read('sw.js'),{self,URL});
 for(const path of ['amministratore','amministratore/','amministratore/index.html','amministratore/buste-paga/','status','status/']){
  for(const mode of ['navigate','cors']){
   let handled=false;
   handler({request:{url:origin+base+path,method:'GET',mode},respondWith(){handled=true;}});
   assert.equal(handled,false,path);
  }
 }
});
