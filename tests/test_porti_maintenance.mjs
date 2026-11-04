import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const access=readFileSync(resolve(ROOT,'porti-access.mjs'),'utf8');
const page=readFileSync(resolve(ROOT,'porti/index.html'),'utf8');

function element(tag){
 return {tagName:tag,className:'',textContent:'',children:[],attributes:{},
  setAttribute(name,value){this.attributes[name]=value;},
  append(...nodes){this.children.push(...nodes);}};
}

test('maintenance shows message and official sources without loading booking',()=>{
 const body={hidden:true,children:[],replaceChildren(...nodes){this.children=nodes}};
 const document={body,createElement:element};
 const context={document,
  window:{parent:{},addEventListener(){throw Error('App should not initialize')}},
  location:{replace(){throw Error('No redirect during maintenance')}},
 };
 vm.runInNewContext(access,context,{timeout:1000});
 const serialized=JSON.stringify(body.children);
 assert.equal(body.hidden,false);
 assert.match(serialized,/temporaneamente sospesi/);
 assert.match(serialized,/Torna a Registro Viaggi/);
 assert.match(serialized,/conateco.it/);
 assert.match(serialized,/tfg.bucci.it/);
 assert.match(serialized,/salernocontainerterminal.com/);
 assert.doesNotMatch(serialized,/LTS_GITHUB_DISPATCH_TOKEN/);
});

test('explicit reversible maintenance switch and cache-busting module reference',()=>{
 assert.match(access,/const MAINTENANCE_ENABLED = true;/);
 assert.match(access,/}else if\(!sameOriginParent\(\)\)\{/);
 assert.match(page,/src="\.\.\/porti-access.mjs\?v=20261104-porti-maintenance-v1"/);
 assert.match(page,/<body hidden>/);
 assert.doesNotMatch(page,/<script(?![^>]*porti-access)[^>]*>/g);
});
