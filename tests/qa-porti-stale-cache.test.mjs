import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const worker=read('sw.js');
const origin='https://pasqualemilano0-rgb.github.io';
const portPath='/LTS-Registro-Viaggi/porti/';
const rulesPath=portPath+'conateco_rules.mjs';
const pagePath=portPath+'index.html';
const oldCode="export const stale=()=>({kind:'good',label:'NAVE IN ACCETTAZIONE'});";
const newCode="export const current=()=>({kind:'good',label:'ACCETTA CARICO'});";

function workerHarness(){
 const events=new Map(),cacheEntries=new Map(),fetches=[];
 let online=true;
 const cache={
  async put(path,response){cacheEntries.set(new URL(path.url||path,origin).pathname,response.clone())},
  async match(path){return cacheEntries.get(new URL(path.url||path,origin).pathname)?.clone()}
 };
 const self={
  location:{origin},
  registration:{scope:origin+'/LTS-Registro-Viaggi/'},
  addEventListener:(name,listener)=>events.set(name,listener)
 };
 const fetch=async (request,options)=>{
  const path=new URL(request.url||request,origin).pathname;
  fetches.push({path,cache:options?.cache||null});
  if(!online)throw new TypeError('Network offline');
  if(path===rulesPath)return new Response(newCode,{status:200});
  if(path===pagePath)return new Response('<script type="module" src="../porti-access.mjs?v=20261110-porti-freshcode-v2"></script>',{status:200});
  return new Response('OTHER_FILE',{status:200});
 };
 runInNewContext(worker,{self,URL,Response,caches:{
  async open(){return cache},
  async match(request){return cache.match(request)},
  async keys(){return []}
 },fetch});
 async function load(path,mode='cors'){
  let pending;
  events.get('fetch')({request:{url:origin+path,method:'GET',mode},
   respondWith(value){pending=value}});
  assert.ok(pending,'Expected SW handler for '+path);
  const result=await pending;
  return {status:result.status,body:await result.text()};
 }
 return {load,cacheEntries,fetches,setOnline:value=>{online=value}};
}

test('an existing cached stale acceptance label never overrides fresh CO.NA.TE.CO. rules',async()=>{
 const h=workerHarness();
 h.cacheEntries.set(rulesPath,new Response(oldCode));
 const result=await h.load(rulesPath+'?v=20261110-porti-freshcode-v2');
 assert.equal(result.status,200);
 assert.equal(result.body,newCode);
 assert.doesNotMatch(result.body,/NAVE IN ACCETTAZIONE/);
 assert.deepEqual(h.fetches.map(x=>x.cache),['reload']);
 assert.equal(await h.cacheEntries.get(rulesPath).clone().text(),newCode,
  'SW cache is refreshed after fetching the latest port logic');
 h.setOnline(false);
 const offline=await h.load(rulesPath+'?v=offline');
 assert.equal(offline.body,newCode,'offline fallback retains newly published code');
});

test('Porti iframe HTML ignores a stale HTTP document cache while online',async()=>{
 const h=workerHarness();
 h.cacheEntries.set(pagePath,new Response('<script src="old-porti.js"></script>'));
 const fresh=await h.load(pagePath+'?v=20261110-porti-freshcode-v2','navigate');
 assert.equal(fresh.status,200);
 assert.match(fresh.body,/porti-freshcode-v2/);
 assert.deepEqual(h.fetches.map(x=>x.cache),['reload']);
 h.setOnline(false);
 const cached=await h.load(pagePath+'?v=20261110-porti-freshcode-v2','navigate');
 assert.equal(cached.status,200,'Offline Porti fallback remains possible');
});

test('published import chain is fully versioned and displays consistent list/detail labels',()=>{
 const parent=read('app.mjs'),page=read('porti/index.html');
 const gate=read('porti-access.mjs'),port=read('porti/app.js');
 const rules=read('porti/conateco_rules.mjs');
 assert.match(parent,/porti\/index\.html\?v=20261110-porti-freshcode-v2/);
 assert.match(page,/porti-access\.mjs\?v=20261110-porti-freshcode-v2/);
 assert.match(gate,/porti\/app\.js\?v=20261110-porti-freshcode-v2/);
 assert.match(port,/conateco_rules\.mjs\?v=20261110-porti-freshcode-v2/);
 assert.match(rules,/kind:'good',label:'ACCETTA CARICO'/);
 assert.doesNotMatch(rules,/NAVE IN ACCETTAZIONE/);
 assert.match(port,/side\.append\(badge\(verdict\.label,verdict\.kind\)/);
 assert.match(port,/results\.append\(deliveryPanel[\s\S]*?badge\(verdict\.label,verdict\.kind\)/);
 assert.match(worker,/20261110-assistant-compact-v1/);
 assert.match(worker,/const isPortCode = isPort &&/);
 assert.match(worker,/NETWORK_FIRST_CODE\.has\(url\.pathname\) \|\| isPortCode/);
 assert.match(worker,/if \(isPort && \(url\.pathname\.startsWith\(PORT_BASE \+ 'data\/'\)/);
});
