import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.mjs'),admin=read('amministratore/admin.mjs');
const start=app.indexOf('let manualRegisterEntry='),end=app.indexOf('\nconst today',start);
assert.ok(start>=0&&end>start);
function entry(query,role,verified=true){
 const location={href:'https://example.test/LTS-Registro-Viaggi/'+query};
 let changed=null;
 const gate=runInNewContext(app.slice(start,end)+'\n;({active:()=>manualRegisterEntry,complete:completeManualRegisterEntry})',{
  URL,location,history:{state:null,replaceState(_s,_t,url){changed=url;}},
  accountAccess:{getRole:()=>role,isVerified:()=>verified}
 });
 return {gate,changed:()=>changed};
}
test('Control Center route requires explicit verified driver login',()=>{
 for(const [role,verified] of [['admin',true],['driver',false],[null,false]]){
  const {gate,changed}=entry('?accesso=manuale',role,verified);
  assert.equal(gate.active(),true);
  assert.equal(gate.complete({role}),false);
  assert.equal(gate.active(),true);
  assert.equal(changed(),null);
 }
 const {gate,changed}=entry('?accesso=manuale&installa=1#register','driver');
 assert.equal(gate.active(),true);
 assert.equal(gate.complete({role:'driver'}),true);
 assert.equal(gate.active(),false);
 assert.equal(changed(),'https://example.test/LTS-Registro-Viaggi/?installa=1#register');
});
test('ordinary direct entry does not suppress remembered driver sign-in',()=>{
 const {gate,changed}=entry('','driver');
 assert.equal(gate.active(),false);
 assert.equal(gate.complete({role:'driver'}),true);
 assert.equal(changed(),null);
});
test('manual entry is gated before reading or restoring the session',()=>{
 const init=app.slice(app.indexOf('async function initialize(){'));
 assert.match(init,/^async function initialize\(\)\{\s*try\{\s*if\(manualRegisterEntry\)\{[\s\S]*?await renderFirstBootGate\([\s\S]*?return;\s*\}/);
 assert.ok(init.indexOf('if(manualRegisterEntry)')<init.indexOf('accountAccess.restoreDriverSession()'));
 assert.ok(init.indexOf('if(manualRegisterEntry)')<init.indexOf('store.activateAccountFromSession()'));
 assert.ok(app.includes('manualRegisterEntry&&hasPreviousSession?null:accountLoginFields'));
 assert.ok(app.includes('if(manualRegisterEntry&&accountAccess.hasSession())'));
 assert.equal(app.split('completeManualRegisterEntry(logged)').length-1,3);
});
test('admin startup preserves the previous driver session and requires explicit account switch',()=>{
 assert.match(admin,/async function authenticate\(freshStatus=null\)\{\s*if\(!account.hasSession\(\)\)[\s\S]*?if\(account.getRole\(\)!=='admin'\)\{\s*lock\([^\n]+\);\s*return;\s*\}/);
 assert.match(admin,/if\(account.hasSession\(\)&&account.getRole\(\)!=='admin'\)\s*throw new Error\([^\n]+\);\s*if\(account.hasSession\(\)\)account.signOut\(\);/);
});
test('explicit return route and asset versions stay aligned',()=>{
 assert.match(read('amministratore/index.html'),/href="\.\.\/\?accesso=manuale"/);
 for(const path of ['index.html','viaggi/index.html'])assert.ok(read(path).includes('app.mjs?v=20261128-role-documents-v1'));
 assert.ok(read('sw.js').includes("const CACHE = PREFIX + '20261128-role-documents-v1';"));
});
