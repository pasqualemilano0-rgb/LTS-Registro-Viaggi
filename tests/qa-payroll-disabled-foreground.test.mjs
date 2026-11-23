/**
 * Regression: Android background/foreground was calling authenticate() even
 * when payrollEndpoint was absent, exposing a nonfunctional document list and
 * "Archivio documenti non ancora configurato per questo ambiente" error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../documenti/driver-documents.mjs',import.meta.url),'utf8');
function part(from,to){
 const start=src.indexOf(from),end=src.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'Missing source anchor '+from);
 return src.slice(start,end);
}
const guard=part('function payrollConfigured(){','function closePdfPreview()');
// Includes payrollConfigured, showNotConfigured and authenticate only.
const load=part('async function load(append=false){',"for(const button of document.querySelectorAll('[data-category]'))");
function harness(){
 const nodes={
  locked:{hidden:true,heading:{textContent:''},description:{textContent:''},link:{textContent:''},
   querySelector(selector){return ({h1:this.heading,p:this.description,a:this.link})[selector];}},
  content:{hidden:false}
 };
 const events={};
 let authCalls=0,apiCalls=0,hideCalls=0,notice='Previously shown API error';
 const runtime={accountAuth:{enabled:true,loginEndpoint:'https://example.invalid/auth'}};
 const account=new Proxy({}, {get(){authCalls++;throw Error('Auth must not run while payroll is OFF');}});
 const api=new Proxy({}, {get(){apiCalls++;throw Error('API must not run while payroll is OFF');}});
 const document={hidden:false,addEventListener(name,fn){events[name]=fn;}};
 const window={addEventListener(name,fn){events[name]=fn;}};
 const $=name=>nodes[name];
 const hideDocuments=()=>{hideCalls++;nodes.content.hidden=true;};
 const note=text=>{notice=text;};
 const impl=new Function('runtime','$','hideDocuments','note','account','api','document',guard+load+
  '\nreturn {payrollConfigured,showNotConfigured,authenticate,load};')(
  runtime,$,hideDocuments,note,account,api,document);
 const listeners=
  part("document.addEventListener('visibilitychange',()=>{","window.addEventListener('pagehide',");
 const pageshow=part("window.addEventListener('pageshow',event=>{","// Direct open and foreground restoration");
 new Function('document','window','authenticate','hideDocuments','payrollConfigured','showNotConfigured','locked',
  listeners+pageshow)(document,window,impl.authenticate,hideDocuments,impl.payrollConfigured,impl.showNotConfigured,()=>{});
 return {impl,nodes,events,document,reset(){nodes.content.hidden=false;notice='Old API error';},
  get authCalls(){return authCalls;},get apiCalls(){return apiCalls;},
  get hideCalls(){return hideCalls;},get notice(){return notice;}};
}
test('disabled payroll always renders the single In preparazione screen',async()=>{
 const h=harness();
 h.reset();
 await h.impl.authenticate();
 assert.equal(h.nodes.content.hidden,true);
 assert.equal(h.nodes.locked.hidden,false);
 assert.match(h.nodes.locked.heading.textContent,/In preparazione/);
 assert.match(h.nodes.locked.description.textContent,/non è ancora attivo/);
 assert.equal(h.nodes.locked.link.textContent,'Torna al Registro Viaggi');
 assert.equal(h.notice,'','stale configuration error must be cleared');
 assert.equal(h.authCalls,0);
 assert.equal(h.apiCalls,0);
});
test('Android foreground return cannot reactivate the list or call API',async()=>{
 const h=harness();h.reset();
 h.document.hidden=false;h.events.visibilitychange();
 await Promise.resolve();
 assert.equal(h.nodes.content.hidden,true);
 assert.equal(h.nodes.locked.hidden,false);
 assert.equal(h.notice,'');
 assert.equal(h.apiCalls,0);assert.equal(h.authCalls,0);
});
test('BFCache pageshow and a locked-account event remain in disabled state',async()=>{
 const h=harness();h.reset();
 h.events.pageshow({persisted:true});
 await Promise.resolve();
 assert.equal(h.nodes.content.hidden,true);
 h.reset();
 h.events['lts-account-locked']();
 assert.equal(h.nodes.content.hidden,true);
 assert.match(h.nodes.locked.heading.textContent,/In preparazione/);
 assert.equal(h.notice,'');assert.equal(h.apiCalls,0);assert.equal(h.authCalls,0);
});
test('refresh attempt cannot send document request with no payroll endpoint',async()=>{
 const h=harness();h.reset();
 await h.impl.load();
 assert.equal(h.nodes.content.hidden,true);
 assert.equal(h.apiCalls,0);
 assert.equal(h.authCalls,0);
 assert.equal(h.notice,'');
});
test('a configured endpoint still takes the ordinary protected auth path',()=>{
 const h=harness();
 assert.equal(h.impl.payrollConfigured(),false);
 assert.match(src,/const status=await account\.verifySession\(\)/);
 assert.match(src,/await api\.acknowledge\(doc\.id\)/);
 assert.match(src,/await api\.download\(doc\.id\)/);
 assert.match(src,/window\.history\.back\(\)/);
});
