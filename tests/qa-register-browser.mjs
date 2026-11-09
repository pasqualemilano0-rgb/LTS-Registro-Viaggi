/** Browser QA: exercise the published register functions in a 390px synthetic driver DOM.
 * No credentials or network archives are involved. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const playwright=createRequire(import.meta.url)((process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test')+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const app=await readFile(resolve(root,'app.mjs'),'utf8');
const begin=app.indexOf('function saturdayNoteText(status)');
const end=app.indexOf('\nfunction searchBox(',begin);
if(begin<0||end<0)throw Error('Register section not found');
const section=app.slice(begin,end);
const base='/LTS-Registro-Viaggi/';
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(!pathname.startsWith(base)){res.writeHead(404).end('Missing');return;}
 const relative=decodeURIComponent(pathname.slice(base.length));
 if(relative==='qa-register.html'){
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}).end('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+base+'app.css"><body><div id="app"></div></body></html>');
  return;
 }
 const file=resolve(root,relative);
 if(!file.startsWith(root+sep)){res.writeHead(403).end('Forbidden');return;}
 try{res.writeHead(200,{'Content-Type':extname(file)==='.mjs'?'text/javascript':extname(file)==='.css'?'text/css':'text/plain'}).end(await readFile(file));}
 catch{res.writeHead(404).end('Missing');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await playwright[engine].launch(engine==='webkit'?{headless:true}:{headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+base+'qa-register.html');
 await page.evaluate(async section=>{
  const D=await import('/LTS-Registro-Viaggi/shared/domain.mjs');
  const R=await import('/LTS-Registro-Viaggi/shared/register-explorer.mjs');
  const now='2026-11-09T08:00:00.000Z';
  const trips=Array.from({length:65},(_,i)=>({id:'qa-'+i,date:'2026-11-09',
   container:'CONT'+String(i).padStart(7,'0'),client:'CLIENTE DEMO',city:'NAPOLI',
   secondClient:'',secondCity:'',services:[],note:'',fareCents:i===8?null:7000,
   secondFareCents:null,sumPickupFares:false,extraCents:D.emptyExtraRates(),
   createdAt:new Date(Date.parse(now)+i*60000).toISOString(),updatedAt:now}));
  trips[9].services=['reefer'];trips[9].extraCents={...D.emptyExtraRates(),reefer:1200};
  trips[10].secondClient='DEPOSITO';trips[10].secondCity='CASERTA';trips[10].secondFareCents=2500;
  const data=D.validateState({...D.emptyState(),profile:{firstName:'TEST',lastName:'AUTISTA'},trips});
  const setup=String.raw`
   const {REGISTER_PAGE_SIZE,registerTripCounts,filterRegisterTrips,paginateRegisterTrips,stepRegisterMonth}=R;
   const root=document.querySelector('#app');
   let state=data,month='2026-11',tab='register',registerQuery='',registerFilter='all';
   let registerLimit=REGISTER_PAGE_SIZE,lastDeletedTrip=null,activationWelcome=false,pdfReport=null,refreshView=null;
   let user={id:'account:synthetic'},busy=false,editingId=null,editingBaseline=null,draftBaselineDate='2026-11-09';
   let draft={date:'2026-11-09',container:'',client:'',city:'',secondClient:'',secondCity:'',services:[],second:false,note:'',noteOpen:false,servicesOpen:false};
   const store={usingAccount:()=>true,getSyncInfo:()=>({pending:false})};
   const today=()=> '2026-11-09';
   const newDraft=()=>({date:today(),container:'',client:'',city:'',secondClient:'',secondCity:'',services:[],second:false,note:'',noteOpen:false,servicesOpen:false});
   const formatDate=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
   const editorVersion=x=>JSON.stringify(x??null);
   const requireCurrentEditor=(expected,current)=>{if(expected!==editorVersion(current))throw Error('Outdated edit');};
   const tripDraftHasWork=()=>false,keepEditorScratchpad=()=>{};
   const toast=msg=>{document.body.dataset.status=msg;};
   const navigate=next=>{tab=next;},openProfile=()=>{},editTrip=()=>{},repeatRoute=()=>{};
   function el(tag,attrs={},...children){
    const node=document.createElement(tag);
    for(const [key,val] of Object.entries(attrs)){
     if(val===null||val===undefined||val===false)continue;
     if(key==='class')node.className=val;
     else if(key==='on'){for(const [type,callback] of Object.entries(val))node.addEventListener(type,callback);}
     else if(['value','disabled','checked','hidden'].includes(key))node[key]=val;
     else node.setAttribute(key,val===true?'':String(val));
    }
    for(const value of children.flat(Infinity))if(value!==null&&value!==undefined&&value!==false)
     node.append(value instanceof Node?value:document.createTextNode(String(value)));
    return node;
   }
   const icon=()=>el('span',{class:'icon'},'•');
   const button=(label,kind='secondary',handler,ico=null,attrs={})=>el('button',
    {type:'button',class:kind.split(' ').map(v=>v+'-button').join(' '),
     on:handler?{click:handler}:{},...attrs},ico?icon(ico):null,label);
   const heading=(kicker,title,subtitle,aside)=>el('div',{class:'view-head section-hero'},
    el('div',{},el('p',{class:'eyebrow'},kicker),el('h1',{},title),el('p',{class:'subtitle'},subtitle)),aside);
   const emptyState=(title,subtitle,ico,action)=>el('div',{class:'empty-state'},el('h3',{},title),el('p',{},subtitle),action);
   const confirmAction=(title,message,callback)=>callback();
   async function persist(next){state=D.validateState(next);return state;}
   function render(){const main=el('main',{class:'app-main view-register'});root.replaceChildren(main);renderRegister(main);}
  `;
  const finish=String.raw`
   render();
   return {getState:()=>state,getMonth:()=>month};
  `;
  window.qaRegister=new Function('D','R','data',setup+section+finish)(D,R,data);
 },section);
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),24);
 await page.locator('.register-load-more').click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),48);
 await page.locator('.register-load-more').click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),65);
 await page.locator('#register-search').fill('CONT0000060');
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),1);
 assert.equal(await page.locator('#register-search').evaluate(n=>n===document.activeElement),true);
 await page.getByRole('button',{name:'Cancella ricerca'}).click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),24);
 await page.getByRole('button',{name:'Tariffe mancanti (1)'}).click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),1);
 await page.getByRole('button',{name:'Seconda presa (1)'}).click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),1);
 await page.getByRole('button',{name:'Servizi extra (1)'}).click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),1);
 await page.getByRole('button',{name:'Tutti (65)'}).click();
 const saved=await page.evaluate(()=>window.qaRegister.getState().trips.find(t=>t.id==='qa-64'));
 await page.getByRole('button',{name:'Elimina viaggio '+saved.container+' del 09/11/2026'}).click();
 assert.equal(await page.evaluate(()=>window.qaRegister.getState().trips.length),64);
 await page.getByRole('button',{name:'Annulla eliminazione'}).click();
 assert.equal(await page.evaluate(()=>window.qaRegister.getState().trips.length),65);
 assert.deepEqual(await page.evaluate(()=>window.qaRegister.getState().trips.find(t=>t.id==='qa-64')),saved);
 await page.getByRole('button',{name:'Mese precedente'}).click();
 assert.equal(await page.evaluate(()=>window.qaRegister.getMonth()),'2026-10');
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),0);
 await page.getByRole('button',{name:'Mese successivo'}).click();
 assert.equal(await page.locator('.register-trip-list .trip-card').count(),24);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
 assert.deepEqual(errors,[]);
 console.log('PASS '+engine+' register V4 390px search, pagination, filters, undo and month controls');
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
