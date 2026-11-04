import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const access=readFileSync(resolve(ROOT,'porti-access.mjs'),'utf8');
const page=readFileSync(resolve(ROOT,'porti/index.html'),'utf8');
const sw=readFileSync(resolve(ROOT,'sw.js'),'utf8');
const BASE='/LTS-Registro-Viaggi/';
const ORIGIN='https://pasqualemilano0-rgb.github.io';

function element(tag){
 return {tagName:tag,className:'',textContent:'',children:[],attributes:{},
  setAttribute(name,value){this.attributes[name]=value;},
  append(...nodes){this.children.push(...nodes);}};
}
function fixture({standalone=false,parentPath=BASE,source=access}={}){
 const events=new Map(),imports=[],calls=[];
 const body={hidden:true,children:[],
  replaceChildren(...nodes){this.children=nodes;},
  append(...nodes){this.children.push(...nodes);}};
 const document={body,createElement:element};
 const location={origin:ORIGIN,pathname:BASE+'porti/index.html',
  replace(url){calls.push(['redirect',url]);}};
 const window={addEventListener(type,fn){events.set(type,fn);},
  __recordImport(file){imports.push(file);return Promise.resolve();}};
 const parent={location:{origin:ORIGIN,pathname:parentPath},
  postMessage(data,target){calls.push(['message',data,target]);}};
 window.parent=standalone?window:parent;
 const sourceUnderTest=source.replaceAll('await import(', 'await window.__recordImport(');
 vm.runInNewContext(sourceUnderTest,{window,location,document,
  setTimeout(fn){calls.push(['timer',fn]);return 42;},
  clearTimeout(id){calls.push(['clear',id]);}},{timeout:1500});
 return {body,events,imports,calls,parent,window};
}

test('Porti must redirect a standalone visitor without starting Booking',()=>{
 const x=fixture({standalone:true});
 assert.equal(x.calls[0][0],'redirect');
 assert.equal(x.calls[0][1],BASE);
 assert.equal(x.imports.length,0);
 assert.equal(x.body.hidden,true);
 assert.equal(x.events.size,0);
});

test('Porti must reject an unrelated parent document',()=>{
 const x=fixture({parentPath:BASE+'external.html'});
 assert.equal(x.calls[0][0],'redirect');
 assert.equal(x.imports.length,0);
});

test('Porti iframe stays closed until same-origin LTS handshake',async()=>{
 const x=fixture();
 assert.ok(x.calls.some(c=>c[0]==='message'&&c[1]?.type==='lts-porti-ready'));
 assert.equal(x.body.hidden,true);
 assert.equal(x.imports.length,0);
 const listener=x.events.get('message');
 assert.equal(typeof listener,'function');
 await listener({origin:ORIGIN,source:{},data:{type:'lts-porti-authorized'}});
 await listener({origin:'https://other.example',source:x.parent,data:{type:'lts-porti-authorized'}});
 await listener({origin:ORIGIN,source:x.parent,data:{type:'other'}});
 assert.equal(x.imports.length,0,'Spoofed messages cannot load Booking');
 assert.equal(x.body.hidden,true);
 await listener({origin:ORIGIN,source:x.parent,data:{type:'lts-porti-authorized'}});
 assert.equal(x.imports.length,2);
 assert.match(x.imports[0],/^\.\/porti\/app\.js\?v=/);
 assert.match(x.imports[1],/^\.\/porti\/driver-ui\.mjs\?v=/);
 assert.equal(x.body.hidden,false);
 await listener({origin:ORIGIN,source:x.parent,data:{type:'lts-porti-authorized'}});
 assert.equal(x.imports.length,2,'Repeated messages never reinitialize modules');
});

test('Original maintenance notice remains a one-line rollback',()=>{
 assert.match(access,/const MAINTENANCE_ENABLED = false;/);
 const maintenance=access.replace('const MAINTENANCE_ENABLED = false;',
  'const MAINTENANCE_ENABLED = true;');
 const x=fixture({standalone:true,source:maintenance});
 assert.equal(x.body.hidden,false);
 assert.equal(x.imports.length,0);
 assert.equal(x.events.size,0);
 const msg=JSON.stringify(x.body.children);
 assert.match(msg,/temporaneamente sospesi/);
 assert.match(msg,/conateco.it/);
 assert.match(msg,/tfg.bucci.it/);
 assert.match(msg,/salernocontainerterminal.com/);
});

test('Protected Pages entry and current PWA cache are required for reopening',()=>{
 assert.match(page,/src="\.\.\/porti-access\.mjs\?v=20261103-lts-gate-v1"/);
 assert.match(page,/<body hidden>/);
 assert.doesNotMatch(page,/<script(?![^>]*porti-access)[^>]*>/g);
 assert.match(access,/}else if\(!sameOriginParent\(\)\)\{/);
 assert.match(sw,/const CACHE = PREFIX \+ '20261104-theme-restore-v1'/);
 assert.match(sw,/BASE \+ 'porti\/app\.js'/);
 assert.match(sw,/if \(NETWORK_FIRST_CODE\.has\(url\.pathname\)\)/);
});
