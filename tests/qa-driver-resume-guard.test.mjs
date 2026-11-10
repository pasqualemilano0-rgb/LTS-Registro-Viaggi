import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transientDriverSessionError,createDriverSessionShield}
 from '../driver-session-guard.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function fakeDocument(){
 const cls=new Set();
 const makeNode=tag=>{
  const handlers=new Map();
  const node={
   tag,children:[],attributes:new Map(),className:'',textContent:'',
   parent:null,hidden:false,disabled:false,inert:false,
   classList:{add:name=>cls.add(name),remove:name=>cls.delete(name),
    contains:name=>cls.has(name)},
   setAttribute(name,value){this.attributes.set(name,String(value))},
   append(...children){for(const child of children){child.parent=this;this.children.push(child)}},
   addEventListener(name,callback){handlers.set(name,callback)},
   click(){handlers.get('click')?.()},
   remove(){if(this.parent){const a=this.parent.children;
     a.splice(a.indexOf(this),1);this.parent=null}}
  };
  return node;
 };
 const body=makeNode('body');
 const document={body,createElement:makeNode};
 return {document,body,classes:cls};
}
test('A temporary outage is not an account revocation',()=>{
 for(const error of [
  {offline:true},{status:0},{status:408},{status:429},{status:500},
  {status:502},{status:503},{status:504},new TypeError('Failed to fetch'),
  {status:400}])
  assert.equal(transientDriverSessionError(error),true);
 for(const error of [{status:401},{status:403}])
  assert.equal(transientDriverSessionError(error),false);
});
test('Resume shield prevents reading or editing the old archive until verification',()=>{
 const {document,body,classes}=fakeDocument();
 const root={inert:false,secretDraft:'Viaggio ancora in modifica'};
 let retries=0;
 const guard=createDriverSessionShield({document,root,onRetry:()=>{retries++}});
 guard.show('Verifica online…',{retryable:false});
 assert.equal(guard.isVisible(),true);
 assert.equal(root.inert,true);
 assert.equal(root.secretDraft,'Viaggio ancora in modifica');
 assert.equal(classes.has('lts-driver-session-blocked'),true);
 const overlay=body.children[0],panel=overlay.children[0],description=panel.children[2],
   retry=panel.children[4];
 assert.equal(overlay.attributes.get('aria-modal'),'true');
 assert.equal(overlay.attributes.get('role'),'alertdialog');
 assert.equal(retry.hidden,true);
 assert.match(description.textContent,/Verifica online/);
 guard.show('Rete instabile. Riprova.',{retryable:true});
 assert.equal(body.children.length,1,'Repeated checks must not stack panels');
 assert.equal(retry.hidden,false);
 retry.click();
 assert.equal(retries,1);
 assert.equal(root.inert,true,'Retry must not unlock an unverified archive');
 guard.close();
 assert.equal(root.inert,false);
 assert.equal(root.secretDraft,'Viaggio ancora in modifica');
 assert.equal(body.children.length,0);
 assert.equal(classes.has('lts-driver-session-blocked'),false);
});
test('Resume shield respects an already inert application',()=>{
 const {document}=fakeDocument(),root={inert:true};
 const guard=createDriverSessionShield({document,root,onRetry:()=>{}});
 guard.show('Controllo…');
 guard.close();assert.equal(root.inert,true);
});
test('Driver returns via retry, not password form; server denial stays protected',()=>{
 const app=read('app.mjs'),css=read('app.css'),
  worker=read('sw.js'),html=read('index.html'),shell=read('shell.html');
 assert.equal(html,shell);
 assert.match(app,/driverSessionShield[.]show\(/);
 assert.match(app,/driverSessionShield[.]close\(/);
 assert.match(app,/transientDriverSessionError\(error\)/);
 assert.match(app,/await accountAccess[.]verifySession\(\)/);
 assert.match(app,/if\(!accountAccess[.]hasSession\(\)\|\|!transientDriverSessionError\(error\)\)/);
 assert.match(app,/renderFirstBootConnectionGate/);
 assert.match(app,/window[.]addEventListener\('online',[^(]*\(\)=>\{/);
 assert.match(app,/savedSessionRetryRunning/);
 assert.match(app,/root[.]querySelector\('\.account-connection-gate'\)/);
 assert.match(app,/if\(resumingVerification\|\|driverSessionShield[.]isVisible\(\)\|\|/);
 assert.doesNotMatch(app,/catch\{\s*store[.]lockRevokedAccount\(\);\s*renderAccountGate/);
 assert.match(css,/body[.]lts-driver-session-blocked #app/);
 assert.match(css,/body[.]lts-driver-session-blocked dialog\[open\]/);
 assert.match(worker,/driver-session-guard[.]mjs/);
 assert.match(worker,/20261110-assistant-chat-v4/);
 assert.match(html,/app[.]mjs[?]v=20261110-tariffe-bugfix-v1/);
});
