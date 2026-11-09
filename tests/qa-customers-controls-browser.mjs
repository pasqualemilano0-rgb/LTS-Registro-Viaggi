/** Browser QA for real V5 customer UI functions with synthetic personal/company records.
 * Covers visible actions on narrow Chromium and WebKit. No real login or API writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const browserPkg=createRequire(import.meta.url)(
 (process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test')+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const app=await readFile(resolve(root,'app.mjs'),'utf8');
function section(first,last){
 const a=app.indexOf(first),b=app.indexOf(last,a+first.length);
 if(a<0||b<a)throw new Error('Customer UI extraction failed: '+first);
 return app.slice(a,b);
}
const parts=[
 section('async function refreshCompanyCustomers(){','\n/** Update only the company list'),
 section('function updateCompanyCustomersPanel(','\nfunction renderInsert('),
 section('function customerCard(','\nfunction renderTariffs(')
].join('\n');
const prefix='/LTS-Registro-Viaggi/';
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end('Missing');return;}
 const relative=decodeURIComponent(url.pathname.slice(prefix.length));
 if(relative==='qa-customers.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(
   '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+prefix+'app.css"><body><div id="app"></div></body></html>');
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
 browser=await browserPkg[engine].launch(engine==='webkit'?{headless:true}:{headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+prefix+'qa-customers.html');

 const init=await page.evaluate(async parts=>{
  const D=await import('/LTS-Registro-Viaggi/shared/domain.mjs');
  const C=await import('/LTS-Registro-Viaggi/shared/customer-site-matches.mjs');
  const F=await import('/LTS-Registro-Viaggi/shared/maps-company-routing.mjs');
  const Csv=await import('/LTS-Registro-Viaggi/shared/customer-csv.mjs');
  const company=Array.from({length:81},(_,i)=>({
   name:'AZIENDA DEMO '+String(i).padStart(3,'0'),city:i%2?'CASERTA':'NAPOLI',
   address:'VIA TEST '+i,phone:'',vat:'',source:'google_maps_link',
   mapsUrl:'https://maps.app.goo.gl/demo'+i
  }));
  const personal=[
   {id:'personal-1',name:'PRIVATO TEST UNO',city:'TERNI',address:'VIA A 12',phone:'+390612345678',vat:''},
   {id:'personal-2',name:'PRIVATO TEST DUE',city:'BENEVENTO',address:'VIA B 24',phone:'',vat:''}
  ];
  const setup=String.raw`
   const {dedupedCustomerDirectory}=C,{filterSharedCustomers}=F;
   const root=document.querySelector('#app');
   let state={...D.emptyState(),customers:personal},companyCustomers=company.slice();
   let companyCustomerSearch='',customerDirectoryScope='all',customerDirectoryLimit=24;
   let companyCustomersError='',companyCustomersLoaded=true,companyCustomersRequest=0;
   let tab='customers',refreshView=null,refreshTripCustomerSuggestions=null;
   let draft={client:'',city:'',container:'CONTAINER NON MODIFICARE',note:'NOTA PRESERVATA',services:[]};
   window.qaActions={maps:0,newClient:0,edit:[],csvExport:0,csvImport:0,navigate:[],toast:[]};
   window.qaRemote=company.slice();
   window.qaFault=false;
   const accountAccess={getAccountId:()=> 'account:synthetic',isVerified:()=>true};
   const store={usingAccount:()=>true};
   const sharedMapsEnabled=()=>true;
   const sharedMapsCustomers=async()=>{
    await new Promise(ok=>setTimeout(ok,80));
    if(window.qaFault)throw new Error('Simulazione rete non disponibile');
    return window.qaRemote.slice();
   };
   const today=()=> '2026-11-09';
   const toast=(message)=>{window.qaActions.toast.push(message);};
   const keepEditorScratchpad=()=>{};
   const navigate=(tabName)=>{window.qaActions.navigate.push(tabName);tab=tabName;};
   const mapsCustomerDialog=()=>{window.qaActions.maps++;};
   const customerDialog=(customer=null)=>{if(customer)window.qaActions.edit.push(customer.id);else window.qaActions.newClient++;};
   const importCustomersCsv=async()=>{window.qaActions.csvImport++;};
   const exportCustomerCsv=Csv.exportCustomerCsv;
   const downloadBlob=()=>{window.qaActions.csvExport++;};
   const customerUndoAction=()=>null;
   const confirmAction=(title,message,callback)=>callback();
   const unique=values=>[...new Set(values.filter(Boolean))];
   const citySuggestions=()=>[];
   function el(tag,attrs={},...children){
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
     if(value===undefined||value===null||value===false)continue;
     if(key==='class')node.className=value;
     else if(key==='on'){for(const [type,cb] of Object.entries(value))node.addEventListener(type,cb);}
     else if(key==='dataset')Object.assign(node.dataset,value);
     else if(['hidden','value','checked','disabled','selected'].includes(key))node[key]=value;
     else node.setAttribute(key,value===true?'':String(value));
    }
    for(const child of children.flat(Infinity))
     if(child!==undefined&&child!==null&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)));
    return node;
   }
   const icon=()=>el('span',{class:'icon'},'•');
   const button=(label,kind='secondary',handler,ico=null,attrs={})=>el('button',
    {type:'button',class:kind.split(' ').map(x=>x+'-button').join(' '),on:handler?{click:handler}:{},...attrs},
    ico?icon(ico):null,label);
   const heading=(kicker,title,subtitle,aside)=>el('div',{class:'view-head section-hero'},
    el('div',{},el('p',{class:'eyebrow'},kicker),el('h1',{},title),el('p',{},subtitle)),aside);
   const refresh=(main)=>renderCustomers(main);
   function render(){
    const main=el('main',{class:'app-main view-customers'});
    root.replaceChildren(main);refresh(main);
   }
  `;
  const finish=String.raw`
   render();
   return {getState:()=>state,getDraft:()=>draft,getScope:()=>customerDirectoryScope,
    getSearch:()=>companyCustomerSearch, getTab:()=>tab,
    setTab:value=>{tab=value;},updateCompanyCustomersPanel};
  `;
  window.qaCustomers=new Function('D','C','F','Csv','company','personal',
   setup+parts+finish)(D,C,F,Csv,company,personal);
  return {shared:company.length,personal:personal.length};
 },parts);
 assert.deepEqual(init,{shared:81,personal:2});
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),24);
 assert.equal(await page.locator('.company-customer-count').textContent(),'83 clienti trovati');
 await page.getByRole('button',{name:/Aziendali 81/}).click();
 assert.equal(await page.locator('.customer-scope-button[aria-pressed="true"]').count(),1);
 assert.equal(await page.locator('.company-customer-count').textContent(),'81 clienti trovati');
 await page.getByRole('button',{name:/Miei 2/}).click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),2);
 await page.getByRole('button',{name:/Tutti 83/}).click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),24);
 await page.locator('#company-customer-search').fill('AZIENDA DEMO 075');
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),1);
 assert.equal(await page.locator('#company-customer-search').evaluate(x=>x===document.activeElement),true);
 await page.getByRole('button',{name:'Cancella ricerca clienti'}).click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),24);
 await page.locator('.customer-more-results').click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),48);
 await page.locator('.customer-more-results').click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),72);
 await page.locator('.customer-more-results').click();
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),83);
 assert.equal(await page.locator('.customer-more-results').isVisible(),false);

 // The refresh button truly executes the backend fetch and produces visible success.
 await page.locator('#company-customer-search').fill('AZIENDA DEMO 050');
 await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).click();
 assert.equal(await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('.customer-refresh-feedback')?.textContent.includes('81 clienti aziendali aggiornati'));
 assert.equal(await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).isDisabled(),false);
 assert.equal(await page.locator('#company-customer-search').inputValue(),'AZIENDA DEMO 050');
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),1);

 // A failed authenticated network refresh is visible and does not discard saved customers.
 await page.evaluate(()=>{window.qaFault=true;});
 await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).click();
 await page.waitForFunction(()=>document.querySelector('.customer-refresh-feedback')?.textContent.includes('Impossibile aggiornare'));
 assert.equal(await page.locator('.customer-directory-results .directory-card').count(),1);
 assert.equal(await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).isDisabled(),false);
 await page.evaluate(()=>{window.qaFault=false;});
 await page.getByRole('button',{name:'Aggiorna clienti aziendali'}).click();
 await page.waitForFunction(()=>document.querySelector('.customer-refresh-feedback')?.textContent.includes('aggiornati'));
 await page.getByRole('button',{name:'Cancella ricerca clienti'}).click();

 // Buttons above the directory and actions on the cards.
 await page.getByRole('button',{name:'Da Google Maps'}).click();
 await page.getByRole('button',{name:'Nuovo cliente'}).click();
 await page.locator('summary').filter({hasText:'Importa o esporta CSV'}).click();
 await page.getByRole('button',{name:'Esporta CSV'}).click();
 const csvInput=page.locator('input[type=file][accept*="csv"]');
 await page.getByRole('button',{name:'Importa CSV'}).click({noWaitAfter:true});
 await csvInput.setInputFiles({name:'clienti.csv',mimeType:'text/csv',
  buffer:Buffer.from('CLIENTE;PARTITA IVA;CITTÀ;INDIRIZZO\nTEST CSV;;NAPOLI;VIA TEST\n')});
 const urls=await page.locator('.directory-open-maps').first().getAttribute('href');
 assert.ok(urls.startsWith('https://maps.app.goo.gl/'));
 await page.getByRole('button',{name:/Miei 2/}).click();
 await page.getByRole('button',{name:/Modifica cliente PRIVATO TEST UNO/}).click();
 await page.locator('.directory-use-customer').first().click();
 const actions=await page.evaluate(()=>({actions:window.qaActions,draft:window.qaCustomers.getDraft()}));
 assert.equal(actions.actions.maps,1);
 assert.equal(actions.actions.newClient,1);
 assert.equal(actions.actions.csvExport,1);
 assert.equal(actions.actions.csvImport,1);
 assert.deepEqual(actions.actions.edit,['personal-1']);
 assert.deepEqual(actions.actions.navigate,['insert']);
 assert.equal(actions.draft.container,'CONTAINER NON MODIFICARE');
 assert.equal(actions.draft.client,'PRIVATO TEST UNO');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
 assert.deepEqual(errors,[],'no uncaught browser failures');
 console.log('PASS '+engine+' customers controls: refresh online/error, search, all filters, pagination, maps, new/edit, use journey, CSV, 390px');
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
