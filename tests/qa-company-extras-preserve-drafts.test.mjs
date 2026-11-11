import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {SERVICES,ACTIVE_SERVICES} from '../shared/domain.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const microtask=()=>new Promise(resolve=>setTimeout(resolve,0));
function element(tag='div'){
 const handlers=new Map();
 const e={tagName:tag.toUpperCase(),children:[],textContent:'',className:'',
  dataset:{},value:'',disabled:false,hidden:false,
  append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=[...items]},
  querySelector(selector){if(selector==='input')return this.children.find(x=>x.tagName==='INPUT')||null;return null},
  querySelectorAll(selector){
   if(selector==='form[data-service]')return this.children.filter(x=>x.tagName==='FORM'&&x.dataset.service);
   if(selector==='input,button')return this.children.flatMap(x=>x.children.filter(y=>y.tagName==='INPUT'||y.tagName==='BUTTON'));
   return [];
  },
  addEventListener(type,callback){handlers.set(type,callback)},
  dispatch(type){return handlers.get(type)?.({preventDefault(){}})},
  setAttribute(){}
 };
 return e;
}
function fixture(){
 const list=element(),refresh=element('button'),status=element('p'),
   dashboard={hidden:false,dataset:{view:'rates'}};
 const ids={'company-extra-refresh':refresh,'company-extra-list':list,
  'company-extra-status':status,dashboard};
 // Evaluate the UI controller with a synthetic DOM. The production module
 // imports a browser-only absolute path, which Node cannot resolve natively.
 const source=read('amministratore/company-extras.mjs')
  .replace(/^import [^\n]+\n/gm,'')
  .replace('export function setupCompanyExtras','function setupCompanyExtras');
 const setupCompanyExtras=runInNewContext(source+'\nsetupCompanyExtras',{
  document:{getElementById:id=>ids[id],createElement:element},
  window:{confirm:()=>true},SERVICES,ACTIVE_SERVICES,
  parseEuro:value=>{
   const raw=String(value).trim().replace(',','.');
   assert.match(raw,/^\d+(?:\.\d{1,2})?$/);
   return Math.round(Number(raw)*100);
  }
 });
 let calls=0;
 const live=SERVICES.map((s,i)=>({serviceKey:s.key,cents:100*(i+1),revision:1}));
 const account={isVerified:()=>true,getRole:()=> 'admin',
  companyTariffs:async(action,data)=>{
   calls++;
   if(action==='list')return {extraRates:live.map(r=>({...r}))};
   if(action==='extra-save'){
    const r=live.find(x=>x.serviceKey===data.serviceKey);
    assert.equal(r.revision,data.expectedRevision);
    r.cents=data.cents;r.revision++;
    return {extra:{...r}};
   }
   throw Error('Unexpected '+action);
  }
 };
 function rowFor(key){return list.children.find(x=>x.dataset.service===key)}
 const api=setupCompanyExtras(account);
 return {api,list,status,live,rowFor,getCalls:()=>calls,
  restore:()=>{}};
}
test('saving one extra preserves another unsaved amount instead of erasing it',async()=>{
 const f=fixture();
 try{
  assert.equal(await f.api.load(),true);
  const first=SERVICES[0].key,second=SERVICES[1].key;
  const a=f.rowFor(first),b=f.rowFor(second);
  a.querySelector('input').value='9,99';a.querySelector('input').dispatch('input');
  b.querySelector('input').value='3,50';b.querySelector('input').dispatch('input');
  a.dispatch('submit');
  await microtask();
  assert.equal(f.live[0].cents,999);
  assert.equal(f.rowFor(first).querySelector('input').value,'9,99');
  assert.equal(f.rowFor(second).querySelector('input').value,'3,50');
  assert.equal(f.rowFor(second).querySelector('input').dataset.dirty,'true');
  assert.match(f.status.textContent,/aggiornata per tutti gli autisti/);
 }finally{f.restore()}
});
test('refresh cannot silently replace an extra amount still being typed',async()=>{
 const f=fixture();
 try{
  assert.equal(await f.api.load(),true);
  const input=f.rowFor(ACTIVE_SERVICES[2].key).querySelector('input');
  input.value='72,30';input.dispatch('input');
  const before=f.getCalls();
  assert.equal(await f.api.load(),false);
  assert.equal(f.getCalls(),before);
  assert.equal(f.rowFor(ACTIVE_SERVICES[2].key).querySelector('input').value,'72,30');
  assert.match(f.status.textContent,/importi extra non ancora salvati/);
 }finally{f.restore()}
});
test('driver refresh only displays a success when the catalogue request actually finished',()=>{
 const source=read('app.mjs');
 assert.match(source,/const \[,confirmed\]=await Promise\.all\(\[store\.syncPending\(\),refreshCompanyRates\(\{quiet:false\}\)\]\)/);
 assert.match(source,/if\(!confirmed\)throw new Error\('Sincronizzazione delle tariffe non confermata/);
 assert.match(source,/if\(!confirmed\)throw new Error\('Aggiornamento degli extra non confermato/);
});

test('retired standalone REEFER is absent even while legacy server catalog has eight rows',async()=>{
 const f=fixture();
 assert.equal(await f.api.load(),true);
 assert.equal(f.rowFor('reefer'),undefined);
 assert.ok(f.rowFor('facchinaggioReefer'),'FACCHINAGGIO REEFER must remain available');
 assert.equal(f.list.children.length,7);
});
