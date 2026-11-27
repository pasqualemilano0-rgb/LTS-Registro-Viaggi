import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../documenti/admin-documents.mjs',import.meta.url),'utf8');
const page=readFileSync(new URL('../amministratore/buste-paga/index.html',import.meta.url),'utf8');
const viewSource=src.slice(src.indexOf('function view(name){'),src.indexOf('function node(',src.indexOf('function view(name){')));
const resumeSource=src.slice(src.indexOf('function restoreWorkspaceInteraction(){'),
 src.indexOf('// One shared admin session for Logistics and Documents',src.indexOf('function restoreWorkspaceInteraction(){')));
assert.ok(viewSource.includes('function view(name)'));
assert.ok(resumeSource.includes("window.addEventListener('focus'"));

function fixture(){
 const els=Object.fromEntries(['login','mfa','setup','workspace'].map(id=>[id,{hidden:true,inert:false}]));
 const listeners={document:new Map(),window:new Map()};
 const doc={hidden:false,addEventListener:(name,cb)=>listeners.document.set(name,cb)};
 const win={addEventListener:(name,cb)=>listeners.window.set(name,cb)};
 const $=id=>els[id];
 const accountState={verified:true,role:'admin'};
 const account={
  isVerified:()=>accountState.verified,
  getRole:()=>accountState.role
 };
 let verified=0,protectedCount=0,notices=0;
 const protect=()=>{protectedCount++;for(const id in els)els[id].hidden=id!=='login';els.workspace.inert=false;};
 const check=async()=>{verified++};
 const notice=()=>{notices++};
 const view=new Function('$','document',viewSource+'\nreturn view;')($,doc);
 const controller=new Function('$','document','window','account','protect','notice','check',
  resumeSource+'\nreturn restoreWorkspaceInteraction;')($,doc,win,account,protect,notice,check);
 return {els,doc,win,accountState,view,controller,
  trigger:(where,name)=>listeners[where].get(name)(),
  checked:()=>verified,protected:()=>protectedCount,notices:()=>notices};
}

test('native Android picker can background and foreground without leaving fields inert',()=>{
 const x=fixture();
 x.view('workspace');
 assert.equal(x.els.workspace.inert,false,'initial authenticated form is interactive');
 x.doc.hidden=true;
 x.trigger('document','visibilitychange');
 assert.equal(x.els.workspace.inert,true,'backgrounded form temporarily protected');
 x.doc.hidden=false;
 x.trigger('document','visibilitychange');
 assert.equal(x.els.workspace.inert,false,'native select and file picker become interactive immediately');
 assert.equal(x.checked(),1,'server session is independently rechecked');
});

test('Android focus recovers from a missing visibilitychange event',()=>{
 const x=fixture();
 x.view('workspace');
 x.els.workspace.inert=true;
 x.trigger('window','focus');
 assert.equal(x.els.workspace.inert,false);
 assert.equal(x.checked(),1);
});

test('workspace re-render clears stale inert state after MFA succeeds',()=>{
 const x=fixture();
 x.els.workspace.inert=true;
 x.view('mfa');
 assert.equal(x.els.workspace.hidden,true);
 x.view('workspace');
 assert.equal(x.els.workspace.hidden,false);
 assert.equal(x.els.workspace.inert,false);
});

test('backgrounded workspace cannot be activated just by view, until foreground',()=>{
 const x=fixture();
 x.doc.hidden=true;
 x.view('workspace');
 assert.equal(x.els.workspace.inert,true);
 x.doc.hidden=false;
 x.trigger('document','visibilitychange');
 assert.equal(x.els.workspace.inert,false);
});

test('failed authorization hides workspace instead of unlocking it',()=>{
 const x=fixture();
 x.view('workspace');
 x.doc.hidden=true;
 x.trigger('document','visibilitychange');
 x.accountState.verified=false;
 x.doc.hidden=false;
 x.trigger('document','visibilitychange');
 assert.equal(x.els.workspace.hidden,true);
 assert.equal(x.els.login.hidden,false);
 assert.equal(x.checked(),0);
 assert.equal(x.protected(),1);
 assert.equal(x.notices(),1);
});

test('page refresh loads patched module and leaves upload validation and MFA in place',()=>{
 assert.match(page,/admin-documents\.mjs\?v=20261123-unified-login-v1/);
 assert.match(page,/id="category"/);
 assert.match(page,/id="month"/);
 assert.match(page,/id="files"/);
 assert.match(src,/const session=await account\.verifySession\(\)/);
 assert.doesNotMatch(src,/account\.verifyAdminTotp\(/);
 assert.match(src,/await api\.upload\(/);
 assert.match(src,/validateUploadFields\(values\)/);
 assert.match(src,/if\(!recipient\?\.documents_enabled\)/);
});
