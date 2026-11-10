import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {evaluateConateco} from '../porti/conateco_rules.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const access=readFileSync(resolve(ROOT,'porti-access.mjs'),'utf8');
const app=readFileSync(resolve(ROOT,'app.mjs'),'utf8');
const page=readFileSync(resolve(ROOT,'porti/index.html'),'utf8');
const sw=readFileSync(resolve(ROOT,'sw.js'),'utf8');
const BASE='/LTS-Registro-Viaggi/';
const ORIGIN='https://pasqualemilano0-rgb.github.io';

function element(tag){
 return {tagName:tag,className:'',textContent:'',children:[],attributes:{},
  setAttribute(name,value){this.attributes[name]=value;},
  append(...nodes){this.children.push(...nodes);}};
}
function fixture({standalone=false,parentPath=BASE,source=access,
 now='2026-11-10T10:00:00Z'}={}){
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
 class ControlledDate extends Date{
  constructor(...args){if(args.length)super(...args);else super(now);}
 }
 vm.runInNewContext(sourceUnderTest,{window,location,document,Date:ControlledDate,
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
 assert.match(page,/src="\.\.\/porti-access\.mjs\?v=20261110-porti-freshcode-v2"/);
 assert.match(page,/<body hidden>/);
 assert.doesNotMatch(page,/<script(?![^>]*porti-access)[^>]*>/g);
 assert.match(access,/}else if\(!sameOriginParent\(\)\)\{/);
 assert.match(sw,/const CACHE = PREFIX \+ '20\d{6}-[a-z0-9-]+-v\d+'/);
 assert.match(sw,/BASE \+ 'porti\/app\.js'/);
 assert.match(sw,/if \(NETWORK_FIRST_CODE\.has\(url\.pathname\) \|\| isPortCode\)/);
});

test('Porti is suspended on Italian Sundays, never starting Booking modules',()=>{
 for(const now of ['2026-11-07T23:00:00Z','2026-11-08T12:00:00Z',
  '2026-11-08T22:59:59Z','2026-03-28T23:00:00Z',
  '2026-03-29T21:59:59Z']){
  const x=fixture({now});
  assert.equal(x.imports.length,0);
  assert.equal(x.events.size,0,'A suspended Porti must not set up a privileged iframe handshake');
  assert.equal(x.body.hidden,false);
  assert.match(JSON.stringify(x.body.children),/Porti sospesi la domenica/);
  assert.match(JSON.stringify(x.body.children),/Registro Viaggi/);
 }
});
test('Porti reopens automatically at Italian Monday midnight, independent of UTC',async()=>{
 for(const now of ['2026-11-07T22:59:59Z','2026-11-08T23:00:00Z',
  '2026-03-29T22:00:00Z']){
  const x=fixture({now});
  const handler=x.events.get('message');
  assert.equal(typeof handler,'function','Porti must reopen on permitted weekdays');
  await handler({origin:ORIGIN,source:x.parent,data:{type:'lts-porti-authorized'}});
  assert.equal(x.imports.length,2);
 }
});
test('The parent LTS app keeps Register usable and blocks Porti iframe on Sundays',()=>{
 assert.match(app,/function isPortiSundayInRome\(at=new Date\(\)\)/);
 assert.match(app,/timeZone:'Europe\/Rome',weekday:'short'/);
 assert.match(app,/if\(sunday\)\{/);
 assert.match(app,/Porti sospesi la domenica/);
 assert.match(app,/navigate\('register'\)/);
 assert.match(app,/setInterval\(syncPortiSundayState,60_000\)/);
 assert.match(access,/timeZone:'Europe\/Rome',weekday:'short'/);
 assert.match(access,/if\(isPortiSundayInRome\(\)\)\{/);
 assert.match(app,/porti\/index\.html\?v=20261110-porti-freshcode-v2/);
});

test('CO.NA.TE.CO. shows ACCETTA CARICO only when acceptance is actually confirmed',()=>{
 const now=new Date('2026-11-10T08:00:00Z');
 const row={
   category:'PREVISTE',vessel:'JOLLY BLUE',voyage:'371',
   vessel_status:'PRE',acceptance_flag:'1',acceptance_icon:'ACCETTA_CARICO',
   stop_cargo:'NO',opening:'2026-11-10 07:00',
   closing:'2026-11-12 18:00',eta:'2026-11-12 00:00'
 };
 const feed={rows:[row],acquired_at:now.toISOString()};
 const ok=evaluateConateco(row,feed,now);
 assert.equal(ok.kind,'good');
 assert.equal(ok.label,'ACCETTA CARICO');
 assert.match(ok.reason,/singolo booking/,'Vessel status is not a booking authorization');
 assert.equal(evaluateConateco({...row,stop_cargo:'SI'},feed,now).label,'CARICO BLOCCATO');
 assert.equal(evaluateConateco({...row,closing:'2026-11-09 18:00'},feed,now).label,'CUT-OFF SCADUTO');
 assert.equal(evaluateConateco(row,{...feed,refresh_failed:true},now).kind,'unknown');
 assert.equal(evaluateConateco(row,{...feed,acquired_at:'2026-11-09T00:00:00Z'},now).label,'DATI DA AGGIORNARE');
 const porti=readFileSync(resolve(ROOT,'porti/app.js'),'utf8');
 assert.match(porti,/badge\(verdict\.label,verdict\.kind\)/);
 assert.match(porti,/conateco_rules\.mjs\?v=20261110-porti-freshcode-v2/);
 assert.match(access,/porti\/app\.js\?v=20261110-porti-freshcode-v2/);
});
