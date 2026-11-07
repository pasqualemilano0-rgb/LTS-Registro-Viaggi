import * as D from '/LTS-Registro-Viaggi/shared/domain.mjs';
import { quickTripFromRoute } from '/LTS-Registro-Viaggi/shared/quick-trip.mjs';
import {unionStates} from '/LTS-Registro-Viaggi/shared/sync-merge.mjs';
import * as store from '/LTS-Registro-Viaggi/client-store.mjs';
import runtimeConfig from '/LTS-Registro-Viaggi/runtime-config.mjs';
import * as accountAccess from '/LTS-Registro-Viaggi/account-access.mjs';
import {createLtsRealtime} from '/LTS-Registro-Viaggi/realtime-client.mjs';
import {sharedMapsEnabled,sharedMapsCustomers,saveSharedMapsCustomer} from '/LTS-Registro-Viaggi/shared-maps-client.mjs';
import {readMapsCustomer} from '/LTS-Registro-Viaggi/maps-reader-client.mjs';
import {companyFareSnapshot} from '/LTS-Registro-Viaggi/shared/company-fares.mjs';
import {companyExtraSnapshot} from '/LTS-Registro-Viaggi/shared/company-extras.mjs';
import {mapsLinkForCompanySync,filterSharedCustomers} from '/LTS-Registro-Viaggi/shared/maps-company-routing.mjs';
import {dedupedCustomerDirectory,matchingSharedCustomer} from '/LTS-Registro-Viaggi/shared/customer-site-matches.mjs';
import {combinedTripCustomerChoices} from '/LTS-Registro-Viaggi/shared/trip-customer-choices.mjs';
import { appendPushSettings } from '/LTS-Registro-Viaggi/push-client.mjs';
import { parseCustomerCsv, mergeCustomerCsv, exportCustomerCsv, MAX_CUSTOMER_CSV_BYTES } from '/LTS-Registro-Viaggi/shared/customer-csv.mjs';

const root = document.querySelector('#app');
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; };
let state = D.emptyState();
let companyCustomers=[]; // In-memory shared list, never part of personal archive/backup.
let companyRates=[]; // Complete corporate catalog, even if a personal rate overrides a route.
let companyRatesLoaded=false;
let companyExtraRates=[]; // One shared extra list across ALL drivers.
let companyExtrasLoaded=false;
let companyRatesRequest=0;
let companyCustomersError='';
let companyCustomersRequest=0;
let companyCustomerSearch=''; // Single live search for company and personal customers.
let customerDirectoryScope='all';
let customerDirectoryLimit=24;
let companyCustomersLoaded=false;
let user = null;
let tab = 'insert';
let tariffTab = 'base';
let month = today().slice(0,7);
let editingId = null;
let editingBaseline = null;
let draft = newDraft();
let busy = false;
let searchValue = '';
let syncMessage = 'Archivio personale';
let syncSavedOnline = false;
let syncWarning = false;
let pdfReport = null;
let toastTimer;
let activationWelcome=false;
let activationFirstOpen=false;
let refreshView = null;
let refreshTripCustomerSuggestions=null;
let refreshTripFareEstimate=null;
let portiFrame = null;
let subscribed = false;
let realtimeBridge=null;
function beginLtsRealtime(){
 if(!store.usingAccount()||!accountAccess.isVerified())return;
 realtimeBridge?.stop();
 realtimeBridge=createLtsRealtime({
  config:runtimeConfig.realtime,
  authenticate:accountAccess.getRealtimeCredentials,
  onChange:kind=>{
   if(!store.usingAccount()||!accountAccess.isVerified())return;
   if(kind==='archive'||kind==='ready')void store.syncPending().catch(()=>{});
   if(kind==='catalog'||kind==='ready'){
    void refreshCompanyCustomers();
    void refreshCompanyRates();
   }
  }
 });
 realtimeBridge.start();
}

let installPrompt = null;
const standaloneMode = window.matchMedia('(display-mode: standalone)');
const isInstalled = () => standaloneMode.matches || navigator.standalone === true;
const isAppleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
function updateInstallButtons(){document.querySelectorAll('[data-install-trigger]').forEach(node=>node.hidden=isInstalled());}
window.addEventListener('appinstalled',()=>{installPrompt=null;document.querySelector('[data-install-dialog]')?.close();updateInstallButtons();});
standaloneMode.addEventListener?.('change',updateInstallButtons);
const tabs = [{id:'insert',label:'Inserisci viaggio',icon:'addTrip'},{id:'register',label:'Registro viaggi',icon:'calendar'},{id:'customers',label:'Clienti',icon:'users'},{id:'tariffs',label:'Tariffe',icon:'wallet'},{id:'porti',label:'Porti',icon:'ship'}];

function newDraft() { return {date:today(),client:'',city:'',container:'',secondClient:'',secondCity:'',services:[],second:false,note:'',noteOpen:false,servicesOpen:false}; }
const editorVersion = value => JSON.stringify(value ?? null);
function requireCurrentEditor(expected,current,label){
 if(expected!==editorVersion(current))throw new Error(`${label} è stato aggiornato o eliminato su un altro dispositivo. I dati del modulo sono conservati: chiudi e riapri la scheda aggiornata prima di salvare.`);
}
function tripEditVersion(trip) {
 if(!trip)return null;
 // Prices and timestamps may change as linked tariffs refresh. Only the
 // journey's editable/business fields invalidate an already open edit form.
 return JSON.stringify([trip.date,trip.container,trip.client,trip.city,trip.secondClient,trip.secondCity,trip.sumPickupFares,D.SERVICES.filter(service=>trip.services.includes(service.key)).map(service=>service.key),trip.note||'']);
}
function el(tag, attrs={}, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(value===null||value===undefined||value===false) continue;
    if(key==='class') node.className=value;
    else if(key==='text') node.textContent=value;
    else if(key==='on') for(const [event,listener] of Object.entries(value)) node.addEventListener(event,listener);
    else if(key==='checked'||key==='disabled'||key==='selected'||key==='value') node[key]=value;
    else if(key==='dataset') Object.assign(node.dataset,value);
    else node.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat(Infinity)) if(child!==null&&child!==undefined&&child!==false) node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}
function icon(name) {
  const paths={
    addTrip:['M4 4h16v16H4z','M8 8v8','M12 8v8','M16 8v8','M8 20v2','M16 20v2'],
    calendar:['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z','M7 3v4','M17 3v4','M3 10h18','M7 14h2','M12 14h2','M7 17h2'],
    users:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M16 4a4 4 0 0 1 0 8','M22 21v-2a4 4 0 0 0-3-3.87'],
    wallet:['M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14','M21 10h-6v5h6','M17 12.5h.01'],
    chevron:['m9 5 7 7-7 7'], close:['m6 6 12 12','M18 6 6 18'], plus:['M12 5v14','M5 12h14'],
    pin:['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z'],
    check:['m5 12 4 4L19 6'], search:['M21 21l-4.3-4.3'], edit:['m16 3 5 5-12 12H4v-5z','m14 5 5 5'],
    trash:['M3 6h18','M9 6V3h6v3','M5 6l1 15h12l1-15','M10 10v7','M14 10v7'],
    pdf:['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6','M8 13h8','M8 17h6'],
    lock:['M5 10h14v11H5z','M8 10V6a4 4 0 0 1 8 0v4'], cloud:['M7 18a5 5 0 1 1 .9-9.9A7 7 0 0 1 21 12a3 3 0 0 1-3 6H7'],
    download:['M12 3v12','m7 10 5 5 5-5','M4 17v4h16v-4'], upload:['M12 16V4','m7 9 5-5 5 5','M4 17v4h16v-4'],
    share:['M12 16V3','m7 8 5-5 5 5','M7 10H4v11h16V10h-3'], info:['M12 11v6','M12 7h.01'],
    link:['M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2','M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2'],
    phone:['M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.6 3a2 2 0 0 1-.6 1.8l-1.2 1.2a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 1.8-.6l3 .6a2 2 0 0 1 1.7 1.9z'],
    truck:['M1 3h14v13H1z','M15 8h4l3 4v4h-7','M3 16v2','M17 16v2'],
    ship:['M5 11V6h14v5','M9 6V3h6v3','m3 12 9-3 9 3-3 7H6z','M12 9v10','M2 21c2 1 3 1 5 0s3-1 5 0 3 1 5 0 3-1 5 0'],
    sliders:['M4 6h6','M14 6h6','M4 12h10','M18 12h2','M4 18h2','M10 18h10','M10 3v6','M14 9v6','M6 15v6'],
    arrow:['M5 12h14','m13 6 6 6-6 6'], refresh:['M20 6v5h-5','M4 18v-5h5','M6 6a8 8 0 0 1 13 2','M18 18A8 8 0 0 1 5 16'],
  };
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');
  for(const d of paths[name]||paths.info){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);}
  const circles={users:[9,7,4],pin:[12,10,2.5],search:[10.5,10.5,6.5],info:[12,12,9]};
  if(circles[name]){const c=document.createElementNS(svg.namespaceURI,'circle');const [cx,cy,r]=circles[name];c.setAttribute('cx',cx);c.setAttribute('cy',cy);c.setAttribute('r',r);svg.append(c);}
  return svg;
}
const name = () => [state.profile.firstName,state.profile.lastName].filter(Boolean).join(' ');
const initials = () => [state.profile.firstName,state.profile.lastName].map(v=>v?.[0]||'').join('') || 'LTS';
function formatDate(date) { return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${date}T12:00:00`)); }
function moneyInput(cents) { return cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',','); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it')); }
function toast(message,error=false) {
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const node=el('div',{class:`toast${error?' error':''}`,role:error?'alert':'status'},message);document.body.append(node);
  toastTimer=setTimeout(()=>node.remove(),error?6500:3600);
}
function heading(kicker,title,subtitle,aside=null) {
 return el('div',{class:'view-head section-hero'},el('div',{},el('p',{class:'eyebrow'},kicker),el('h1',{},title),el('p',{class:'subtitle'},subtitle)),aside);
}
function button(label,kind='secondary',handler,ico=null,attrs={}) {
 return el('button',{type:'button',class:kind.split(' ').map(name=>`${name}-button`).join(' '),on:handler?{click:handler}:{},...attrs},ico?icon(ico):null,label);
}
function field(label,name,value='',options={}) {
 const id=options.id||`field-${name}-${Math.random().toString(36).slice(2,7)}`;
 const {hint,optional,onInput,...rest}=options;
 const input=el('input',{id,name,value,autocomplete:'off',autocapitalize:'characters',spellcheck:'false',...rest});
 if(!['date','month','number','file'].includes(input.type)&&input.inputMode!=='decimal') input.addEventListener('input',()=>{const start=input.selectionStart;const end=input.selectionEnd;const upper=input.value.toLocaleUpperCase('it-IT');if(input.value!==upper){input.value=upper;try{input.setSelectionRange(start,end);}catch{}}});
 if(onInput)input.addEventListener('input',onInput);
 const wrap=el('div',{class:'field'},el('label',{class:'field-label',for:id},label,optional?el('span',{class:'optional','aria-hidden':'true'},'Facoltativo'):null),input,hint?el('p',{class:'field-hint'},hint):null);
 return {wrap,input};
}
function decorateTripField(value,ico,kind=''){value.wrap.classList.add('trip-field');if(kind)value.wrap.classList.add(kind);value.wrap.prepend(el('span',{class:'trip-field-icon','aria-hidden':'true'},icon(ico)));return value;}
function datalist(id,values){return el('datalist',{id},unique(values).map(value=>el('option',{value})));}
function syncNode(compact=false){
  return el('div',{class:`sync-status${compact?' sync-status-top':''}${syncWarning?' warning':''}`,
    id:compact?'sync-status-top':'sync-status',hidden:syncSavedOnline,role:compact?'status':null,
    'aria-live':compact?'polite':null},el('span',{class:'status-dot'}),syncMessage);
}
function setStatus(status){
 const value=typeof status==='string'?status:status?.message||status?.status||'';
 const known={saved:'Dati salvati',saving:'Salvataggio in corso…',syncing:'Salvataggio online in corso…',synced:'Archivio online aggiornato',pending:'Salvato sul dispositivo · sincronizzazione in attesa',conflict:'Modifiche da controllare · apri Profilo → Risolvi sincronizzazione',offline:'Offline · dati conservati su questo dispositivo',error:'Sincronizzazione da verificare',online:'Connessione disponibile',local:'Dati salvati su questo dispositivo'};
 syncMessage=known[value]||value||'Archivio personale';syncWarning=/offline|error|errore|locale|pending|conflict|attesa/i.test(typeof status==='string'?status:status?.status||value);
 syncSavedOnline=!syncWarning&&(status?.status==='synced'||value==='synced'||String(value).trim().toLocaleLowerCase('it-IT')==='dati salvati online');
 const current=document.querySelector('#sync-status');if(current)current.replaceWith(syncNode());
 const top=document.querySelector('#sync-status-top');if(top)top.replaceWith(syncNode(true));
 const wrap=document.querySelector('.sync-banner-wrap');if(wrap)wrap.hidden=syncSavedOnline;
}
async function persist(nextState){
 if(busy)throw new Error('Attendi il salvataggio in corso.');
 busy=true;document.querySelectorAll('[data-save]').forEach(node=>node.disabled=true);
 try{
  const checked=D.validateState(nextState);
  const result=await store.saveState(checked);
  const previous=state;state=result?.state?D.validateState(result.state):checked;refreshDraftCustomers(previous,state);
  pdfReport=null;
  return state;
 }catch(error){if(error.pendingState){const previous=state;state=D.validateState(error.pendingState);refreshDraftCustomers(previous,state);}throw error;
 }finally{busy=false;document.querySelectorAll('[data-save]').forEach(node=>node.disabled=false);}
}
function refreshDraftCustomers(previous,next){
 const nextById=new Map(next.customers.map(customer=>[customer.id,customer]));
 for(const customer of previous.customers){const current=nextById.get(customer.id);if(current&&customer.name!==current.name)for(const field of ['client','secondClient'])if(D.normalizeText(draft[field])===customer.name)draft[field]=current.name;}
}
function unmountPorti(){
 if(!portiFrame)return;
 // Leaving Porti stops its polling and discards the in-frame booking query.
 portiFrame.src='about:blank';portiFrame.remove();portiFrame=null;
}
function navigate(next){if(next==='customers'&&tab!=='customers'){companyCustomerSearch='';customerDirectoryScope='all';customerDirectoryLimit=24;}if(next!=='register')activationWelcome=false;if(tab==='porti'&&next!==tab)unmountPorti();tab=next;searchValue='';render();if(next==='insert'||next==='customers')void refreshCompanyCustomers();if(['insert','tariffs','customers'].includes(next)&&store.usingAccount()&&navigator.onLine!==false){void store.syncPending().catch(()=>{});void refreshCompanyRates();}const scroll=document.querySelector('.app-scroll');if(scroll)scroll.scrollTop=0;window.scrollTo({top:0,behavior:'auto'});}
function render(){
 const scrollTop=document.querySelector('.app-scroll')?.scrollTop||0;
 refreshView=null;
 refreshTripCustomerSuggestions=null;
 refreshTripFareEstimate=null;
 const frame=el('div',{class:'app-frame'});
 const header=el('header',{class:'topbar'},el('div',{class:'brand'},el('img',{src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS',width:116,height:46}),el('div',{class:'brand-copy'},el('p',{class:'eyebrow'},'Registro viaggi'),el('p',{class:'brand-title'},name()||'Il tuo registro'))),el('div',{class:'header-actions'},el('button',{class:'install-icon-button',type:'button','data-install-trigger':true,hidden:isInstalled(),'aria-label':'Installa app',title:'Installa LTS sul telefono',on:{click:startInstall}},icon('download')),el('button',{class:'profile-button',type:'button','aria-label':`Profilo di ${name()||'autista'}`,title:'Profilo e backup',on:{click:()=>openProfile()}},initials())));
 const main=el('main',{class:`app-main view-${tab}`,id:'main-content'});
 const nav=el('nav',{class:'bottom-nav','aria-label':'Navigazione principale'},tabs.map(item=>el('button',{type:'button',class:`nav-item${tab===item.id?' active':''}`,'aria-current':tab===item.id?'page':null,on:{click:()=>navigate(item.id)}},icon(item.icon),el('span',{},item.label))));
 // Detaching an iframe, even if the same node is appended again, resets its
 // browsing context. Refresh the shell around the connected Porti document.
 if(tab==='porti'&&portiFrame?.isConnected){
  document.querySelector('.topbar').replaceWith(header);
  document.querySelector('.bottom-nav').replaceWith(nav);
  document.querySelector('#sync-status')?.replaceWith(syncNode());
  return;
 }
 unmountPorti();
 const scroll=el('div',{class:'app-scroll'},header,el('div',{class:'sync-banner-wrap',hidden:syncSavedOnline},syncNode(true)),main);
 frame.append(scroll,nav);root.replaceChildren(frame);
 if(tab==='insert')renderInsert(main); else if(tab==='register')renderRegister(main);else if(tab==='customers')renderCustomers(main);else if(tab==='porti')renderPorti(main);else renderTariffs(main);
 if(tab!=='porti')main.append(syncNode());
 scroll.scrollTop=scrollTop;
}
function renderPorti(main){
 const url=(runtimeConfig.basePath??'/')+'porti/index.html?v=20261106-porti-clean-v2';
 portiFrame=el('iframe',{class:'porti-frame',src:url,title:'Porti e booking',referrerpolicy:'no-referrer'});
 main.append(el('div',{class:'porti-heading'},el('h1',{},'Porti')),portiFrame);
}
// The port module is a subview of a verified LTS account, not a public standalone app.
window.addEventListener('message',event=>{
 if(event.origin!==location.origin || event.data?.type!=='lts-porti-ready')return;
 if(tab!=='porti'||!portiFrame||event.source!==portiFrame.contentWindow)return;
 if(!store.usingAccount()||!accountAccess.isVerified())return;
 event.source.postMessage({type:'lts-porti-authorized'},location.origin);
});
function receiveState(record,{source}={}){
 // Local saves finish in persist(); background changes update the open view
 // without replacing its inputs or discarding a journey still being typed.
 if(source==='save'||!record?.state)return;
 const changedIdentity=Boolean(user?.id&&record.user?.id!==user.id);
 const previous=state;state=D.validateState(record.state);refreshDraftCustomers(previous,state);user=record.user||null;pdfReport=null;
 if(changedIdentity){
  draft=newDraft();editingId=null;editingBaseline=null;document.querySelectorAll('dialog').forEach(dialog=>dialog.close());render();
  // initialize() owns first-time account onboarding. Avoid opening two
  // profile dialogs after switching from a legacy device archive.
  if(source!=='account'&&(!state.profile.firstName||!state.profile.lastName))openProfile(true);
  return;
 }
 const brandName=document.querySelector('.brand-title');if(brandName)brandName.textContent=name()||'Il tuo registro';
 const profile=document.querySelector('.profile-button');
 if(profile){profile.textContent=initials();profile.setAttribute('aria-label',`Profilo di ${name()||'autista'}`);}
 if(refreshView)refreshView();else render();
}
function emptyState(title,message,ico='truck',action=null){return el('section',{class:'panel empty-state'},el('div',{class:'empty-icon'},icon(ico)),el('h3',{},title),el('p',{},message),action);}
/** Read-only tariff list for every verified driver. The personal archive
 * remains the source of trips; the separate catalog shows company prices even
 * on routes for which a driver already has a personal rate. */
async function refreshCompanyRates({quiet=true}={}){
 if(!store.usingAccount()||!accountAccess.isVerified())return false;
 const owner=accountAccess.getAccountId(),request=++companyRatesRequest;
 try{
  const catalog=await accountAccess.driverCompanyCatalog();
  if(owner!==accountAccess.getAccountId()||request!==companyRatesRequest)return false;
  const updated=catalog.tariffs.map(item=>({id:'company:'+item.id,customerId:null,
   client:D.normalizeText(item.client),city:D.normalizeText(item.city),cents:item.cents}));
  const changed=!companyRatesLoaded||!companyExtrasLoaded||
   JSON.stringify(updated)!==JSON.stringify(companyRates)||
   JSON.stringify(catalog.extraRates)!==JSON.stringify(companyExtraRates);
  companyRates=updated;companyRatesLoaded=true;
  companyExtraRates=catalog.extraRates;companyExtrasLoaded=true;
  if(changed&&(tab==='tariffs'||tab==='customers')&&refreshView)refreshView();
  if(changed&&tab==='insert')refreshTripFareEstimate?.();
  return true;
 }catch(error){
  // An offline/cache failure must never erase a previously verified catalog
  // or cause a driver to lose access to their personal trip drafts.
  if(!quiet)throw error;
  return false;
 }
}
/** Read-only shared list. An unavailable network never unlocks an account. */
async function refreshCompanyCustomers(){
 if(!sharedMapsEnabled()||!store.usingAccount()||!accountAccess.isVerified())return;
 const owner=accountAccess.getAccountId(),request=++companyCustomersRequest;
 try{
  const customers=await sharedMapsCustomers();
  if(owner!==accountAccess.getAccountId()||request!==companyCustomersRequest)return;
  const changed=!companyCustomersLoaded||JSON.stringify(companyCustomers)!==JSON.stringify(customers)||Boolean(companyCustomersError);
  companyCustomers=customers;
  companyCustomersLoaded=true;
  companyCustomersError='';
  if(changed&&tab==='insert')refreshTripCustomerSuggestions?.();
  // Keep the currently edited trip, caret, keyboard and open dialogs intact.
  // A background catalog sync must only refresh suggestions/list contents,
  // never reconstruct the entire screen with render().
  if(changed&&tab==='customers')updateCompanyCustomersPanel();
  if(changed&&tab==='insert'){
   const list=document.getElementById('trip-customers');
   const form=list?.closest('form');
   if(form){
    const update=(node,values)=>{
     if(node)node.replaceChildren(...unique(values).map(value=>el('option',{value})));
    };
    update(list,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client),...companyCustomers.map(c=>c.name)]);
    const first=form.querySelector('[name="client"]');
    update(form.querySelector('#trip-cities'),citySuggestions(first?.value||draft.client));
    const second=form.querySelector('[name="secondClient"]');
    update(form.querySelector('#second-cities'),citySuggestions(second?.value||draft.secondClient));
   }
  }
 }catch{
  // Keep the existing personal data and previously loaded shared suggestions.
  if(owner!==accountAccess.getAccountId()||request!==companyCustomersRequest)return;
  companyCustomersError='Impossibile aggiornare l’elenco clienti aziendali. Verifica la connessione e riprova.';
  if(tab==='customers')updateCompanyCustomersPanel();
 }
}
/** Update only the company list, leaving the search field, caret and keyboard intact. */
/** Combined search without merging or changing the private client archive. */
function updateCompanyCustomersPanel(panel=document.querySelector('.company-customer-list')){
 if(!panel)return;
 const directory=dedupedCustomerDirectory(companyCustomers,state.customers);
 const found=filterSharedCustomers(directory.shared,companyCustomerSearch);
 // "Tutti" has one card per physical site; "Miei" still lets the driver
 // inspect/edit every original private contact, including older duplicates.
 const personal=filterSharedCustomers(
  customerDirectoryScope==='personal'?state.customers:directory.personal,
  companyCustomerSearch);
 const personalTotal=filterSharedCustomers(state.customers,companyCustomerSearch).length;
 const all=[...found.map(customer=>({...customer,directorySource:'shared'})),
  ...personal.map(customer=>({...customer,directorySource:'personal'}))];
 const visible=all.filter(customer=>customerDirectoryScope==='all'||
  customer.directorySource===customerDirectoryScope)
  .sort((a,b)=>a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it')||
   (a.directorySource==='shared'?-1:1));
 const count=panel.querySelector('.company-customer-count'),
  clear=panel.querySelector('.customer-search-clear'),
  list=panel.querySelector('.customer-directory-results'),
  status=panel.querySelector('.company-customer-error'),
  more=panel.querySelector('.customer-more-results');
 if(status){status.textContent=companyCustomersError;status.hidden=!companyCustomersError;}
 if(clear)clear.hidden=!companyCustomerSearch.trim();
 if(count)count.textContent=visible.length
  ?`${visible.length} ${visible.length===1?'cliente trovato':'clienti trovati'}`
  :companyCustomerSearch.trim()?'Nessun cliente corrisponde alla ricerca.'
   :companyCustomersLoaded||!sharedMapsEnabled()?'Nessun cliente in questa categoria.'
   :'Aggiornamento clienti aziendali in corso…';
 panel.querySelectorAll('[data-customer-scope]').forEach(button=>{
  const chosen=button.dataset.customerScope===customerDirectoryScope;
  button.classList.toggle('selected',chosen);
  button.setAttribute('aria-pressed',String(chosen));
  const number=button.querySelector('.customer-scope-count');
  if(number)number.textContent=String(button.dataset.customerScope==='shared'?
    found.length:button.dataset.customerScope==='personal'?personalTotal:all.length);
 });
 if(list)list.replaceChildren(...visible.slice(0,customerDirectoryLimit).map(customer=>
  customerCard(customer,{shared:customer.directorySource==='shared'})));
 if(more){
  more.hidden=visible.length<=customerDirectoryLimit;
  more.textContent=`Mostra altri clienti (${visible.length-customerDirectoryLimit})`;
 }
}
/** Pre-fill only client and location: never overwrite a stored journey. */
function useCustomerInTrip(customer){
 const client=D.normalizeText(customer.name),city=D.normalizeText(customer.city);
 const apply=()=>{
  draft={...draft,client,city};
  navigate('insert');
  toast(city?'Cliente e località inseriti nel viaggio.':'Cliente inserito: completa la località.');
 };
 if(draft.client&&D.normalizeText(draft.client)!==client)
  confirmAction('Sostituire il cliente nel viaggio?',
   'Il cliente già inserito sarà sostituito. Container, data, note e servizi resteranno invariati.',
   apply,'Usa cliente');
 else apply();
}
function companyCustomersPanel(){
 const panel=el('section',{class:'panel company-customer-list customer-hub','aria-label':'Elenco clienti'});
 const searchResults=()=>{
  const next=input.value;
  // On a new search always include both shared and personal customers.
  // Filters can still be applied deliberately after the user starts searching.
  if(!companyCustomerSearch.trim()&&next.trim())customerDirectoryScope='all';
  companyCustomerSearch=next;customerDirectoryLimit=24;
  updateCompanyCustomersPanel(panel);
 };
 const input=el('input',{type:'search',id:'company-customer-search',
  value:companyCustomerSearch,placeholder:'Cerca nome, località o via…',
  'aria-label':'Cerca clienti per nome, città, indirizzo o telefono',
  'aria-controls':'customer-directory-results',autocomplete:'off',
  on:{input:searchResults,search:searchResults,change:searchResults,compositionend:searchResults}});
 const clearSearch=el('button',{type:'button',class:'customer-search-clear',
  hidden:!companyCustomerSearch.trim(),'aria-label':'Cancella ricerca clienti',
  on:{click:()=>{
   input.value='';companyCustomerSearch='';customerDirectoryScope='all';
   customerDirectoryLimit=24;updateCompanyCustomersPanel(panel);input.focus();
  }}},icon('close'));
 const scope=el('div',{class:'customer-scope-tabs',role:'group','aria-label':'Tipologia di clienti'},
  ...[['all','Tutti'],['shared','Aziendali'],['personal','Miei']].map(([key,label])=>
   el('button',{type:'button',class:'customer-scope-button',dataset:{customerScope:key},
    'aria-pressed':String(key===customerDirectoryScope),
    on:{click:()=>{customerDirectoryScope=key;customerDirectoryLimit=24;
     updateCompanyCustomersPanel(panel);}}},
    label,el('span',{class:'customer-scope-count'},'0'))));
 const upload=el('input',{type:'file',accept:'.csv,text/csv',class:'visually-hidden',
  'aria-label':'Importa CSV clienti',
  on:{change:async event=>{const file=event.target.files?.[0];event.target.value='';
   if(file)await importCustomersCsv(file);}}});
 const csvTools=el('details',{class:'customer-more-tools'},
  el('summary',{},icon('upload'),'Importa o esporta CSV'),
  el('div',{class:'csv-tools'},button('Importa CSV','secondary',()=>upload.click(),'upload'),
   button('Esporta CSV','secondary',()=>{
    try{downloadBlob(new Blob([exportCustomerCsv(state)],{type:'text/csv;charset=utf-8'}),
     `LTS-Clienti-${today()}.csv`);toast('Rubrica esportata.');}
    catch(error){toast(error.message,true);}
   },'download')),upload);
 const more=el('button',{type:'button',class:'secondary-button customer-more-results',
  on:{click:()=>{customerDirectoryLimit+=24;updateCompanyCustomersPanel(panel);}}},
  'Mostra altri clienti');
 panel.append(
  el('div',{class:'customer-hub-heading'},
   el('div',{},el('h2',{},'Trova un cliente'),
    el('p',{class:'company-customer-help'},'Un elenco unico, con clienti aziendali e personali.')),
   button('Aggiorna','text',()=>{void refreshCompanyCustomers();},'refresh',
    {'aria-label':'Aggiorna clienti aziendali'})),
  el('div',{class:'company-customer-search'},icon('search'),input,clearSearch),
  scope,
  el('div',{class:'customer-hub-actions'},
   button('Da Google Maps','primary',mapsCustomerDialog,'pin'),
   button('Nuovo cliente','secondary',()=>customerDialog(),'plus')),
  el('p',{class:'company-customer-count',role:'status','aria-live':'polite'}),
  el('p',{class:'company-customer-error',role:'status',hidden:!companyCustomersError}),
  el('div',{class:'catalog-list customer-directory-results',id:'customer-directory-results'}),
  more,csvTools);
 updateCompanyCustomersPanel(panel);
 return panel;
}
function renderInsert(main){
 const amountContext=D.buildTripAmountContext(state);
 const estimateId=editingId||crypto.randomUUID();const estimateCreatedAt=new Date().toISOString();
 const layout=el('div',{class:'form-layout'});const form=el('form',{class:'panel form-panel',novalidate:true});
 const error=el('div',{class:'form-error',role:'alert'});
 form.append(error);
 if(editingId)form.append(el('div',{class:'editing-banner'},'Stai modificando un viaggio',el('button',{type:'button',class:'remove-button',on:{click:()=>{editingId=null;editingBaseline=null;draft=newDraft();render();}}},'Annulla')));
 const date=field('Data','date',draft.date,{type:'date',required:true,min:'1900-01-01',max:'2199-12-31'});
 date.wrap.classList.add('date-capsule');
 const dateCaptionText=el('span',{},'Data');
 date.wrap.append(el('span',{class:'date-caption','aria-hidden':'true'},icon('calendar'),dateCaptionText));
 const updateDateCaption=()=>{dateCaptionText.textContent=/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date.input.value)?formatDate(date.input.value):'Data';};
 date.input.addEventListener('input',updateDateCaption);date.input.addEventListener('change',updateDateCaption);updateDateCaption();
 form.append(el('div',{class:'section-hero insert-hero'},el('h1',{},editingId?'Modifica viaggio':'Inserisci viaggio'),date.wrap));
 // Dashboard shortcut: reuse the same Google Maps import and confirmation path
 // as Clienti. Preserve the current unsaved journey before opening the dialog.
 if(!editingId)form.append(el('section',{class:'dashboard-maps-shortcut',
  'aria-label':'Aggiungi cliente Google Maps dalla dashboard'},
  el('div',{class:'dashboard-maps-shortcut-copy'},icon('pin'),
   el('div',{},el('strong',{},'Nuovo cliente?'),
    el('p',{},'Aggiungilo da Google Maps senza uscire dalla dashboard.'))),
  button('Aggiungi da Google Maps','secondary',()=>{collect();mapsCustomerDialog();},'plus',
   {class:'secondary-button dashboard-maps-shortcut-button',
    'aria-label':'Aggiungi un cliente da Google Maps'})));
 const container=decorateTripField(field('Sigla container','container',draft.container,{placeholder:'MSDU345676.8',class:'container-input',required:true,maxlength:500}),'addTrip','container-field');
 const customerListId='trip-customers'; const cityListId='trip-cities';
 const client=decorateTripField(field('Cliente','client',draft.client,{placeholder:'Nome cliente',required:true,maxlength:500}),'users');
 const city=decorateTripField(field('Località','city',draft.city,{placeholder:'Es. Napoli',list:cityListId,required:true,maxlength:500}),'pin');
 const hint=el('p',{class:'field-hint',id:'tariff-hint'});city.wrap.append(hint);
 const suggestionRefreshes=[];
 form.append(el('div',{class:'trip-fields'},container.wrap,tripCustomerAutocomplete(client,city),city.wrap),datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client),...companyCustomers.map(c=>c.name)]));
 let cities=datalist(cityListId,citySuggestions(draft.client));form.append(cities);
 const add=el('button',{type:'button',class:'add-pickup trip-option','aria-label':draft.second?'Rimuovi seconda presa':'Aggiungi una seconda presa','aria-expanded':String(Boolean(draft.second)),on:{click:()=>{collect();draft.second=!draft.second;if(!draft.second){draft.secondClient='';draft.secondCity='';}render();}}},icon('pin'),el('span',{class:'tile-label'},'Seconda presa'),el('span',{class:'plus-disc','aria-hidden':'true'},draft.second?'−':'+'));
 const options=el('div',{class:'trip-options','aria-label':'Opzioni del viaggio'},add);form.append(options);
 let secondClient=null,secondCity=null;
 if(draft.second){
  secondClient=field('Cliente','secondClient',draft.secondClient,{placeholder:'Cliente seconda presa',required:true,maxlength:500});
  secondCity=field('Località','secondCity',draft.secondCity,{placeholder:'Città seconda presa',list:'second-cities',required:true,maxlength:500});
  form.append(el('section',{class:'second-pickup'},el('div',{class:'pickup-heading'},'Seconda presa · stesso container'),tripCustomerAutocomplete(secondClient,secondCity,true),secondCity.wrap,datalist('second-cities',citySuggestions(draft.secondClient))));
  secondClient.input.addEventListener('change',()=>{autofillCity(secondClient.input,secondCity.input);updateEstimate();});
 }
 /** Client suggestions appear beneath the existing input, without another search field. */
 function tripCustomerAutocomplete(clientField,cityField,second=false){
  const input=clientField.input;
  const menu=el('div',{class:'trip-client-suggestions',id:second?'trip-client-suggestions-second':'trip-client-suggestions-main',role:'listbox','aria-label':'Clienti memorizzati',hidden:true});
  const holder=el('div',{class:'trip-client-autocomplete'},clientField.wrap,menu);
  input.setAttribute('autocomplete','off');
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls',menu.id);input.setAttribute('aria-expanded','false');
  let choices=[],active=-1;
  function hide(){menu.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function pick(customer){
   input.value=customer.name;cityField.input.value=customer.city;hide();
   if(second){form.querySelector('#second-cities')?.replaceWith(datalist('second-cities',citySuggestions(customer.name)));}
   else{const updated=datalist(cityListId,citySuggestions(customer.name));cities.replaceWith(updated);cities=updated;}
   updateEstimate();
  }
  function highlight(){
   [...menu.children].forEach((option,index)=>{option.classList.toggle('active',index===active);option.setAttribute('aria-selected',String(index===active));});
   if(active>=0){input.setAttribute('aria-activedescendant',menu.children[active].id);menu.children[active].scrollIntoView({block:'nearest'});}
   else input.removeAttribute('aria-activedescendant');
  }
  function draw(){
   const query=input.value.trim();
   if(!query||document.activeElement!==input){hide();return;}
   const all=combinedTripCustomerChoices({personal:state.customers,trips:state.trips,shared:companyCustomers});
   choices=filterSharedCustomers(all,query).slice(0,12);active=-1;
   if(!choices.length){hide();return;}
   menu.replaceChildren(...choices.map((customer,index)=>el('button',{type:'button',id:menu.id+'-'+index,role:'option','aria-selected':'false',class:'trip-client-suggestion',on:{pointerdown:event=>{event.preventDefault();pick(customer);},click:()=>pick(customer)}},el('strong',{},customer.name),el('span',{},customer.city||'Località da completare'),customer.address?el('small',{},customer.address):null)));
   menu.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',draw);input.addEventListener('focus',draw);input.addEventListener('blur',hide);
  input.addEventListener('keydown',event=>{
   if(menu.hidden)return;
   if(event.key==='Escape'){event.preventDefault();hide();}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=event.key==='ArrowDown'?(active+1)%choices.length:(active+choices.length)%choices.length;highlight();}
   else if(event.key==='Enter'&&active>=0){event.preventDefault();pick(choices[active]);}
  });
  suggestionRefreshes.push(draw);return holder;
 }
 refreshTripCustomerSuggestions=()=>{for(const draw of suggestionRefreshes)draw();};
 const noteInput=el('textarea',{id:'trip-note',name:'note',value:draft.note||'',maxlength:2000,rows:3,autocapitalize:'characters',spellcheck:'false',placeholder:'Scrivi una nota per questo viaggio'});
 const noteEditor=el('section',{class:'trip-note-editor',id:'trip-note-editor',hidden:!draft.noteOpen},el('label',{class:'field-label',for:'trip-note'},'Nota del viaggio',el('span',{class:'optional'},'Facoltativa')),noteInput,el('p',{class:'trip-note-help'},icon('lock'),'Visibile solo nell’app · esclusa dal PDF mensile'));
 const noteSymbol=el('span',{class:'plus-disc','aria-hidden':'true'},draft.noteOpen?'−':'+');
 const noteToggle=el('button',{type:'button',class:'trip-option','aria-expanded':String(Boolean(draft.noteOpen)),'aria-controls':'trip-note-editor',on:{click:()=>{collect();draft.noteOpen=!draft.noteOpen;noteEditor.hidden=!draft.noteOpen;noteToggle.setAttribute('aria-expanded',String(draft.noteOpen));noteSymbol.textContent=draft.noteOpen?'−':'+';if(draft.noteOpen)noteInput.focus();}}},icon('edit'),el('span',{class:'tile-label'},'INSERISCI NOTA'),noteSymbol);
 options.append(noteToggle);form.append(noteEditor);
 noteInput.addEventListener('input',()=>{const start=noteInput.selectionStart,end=noteInput.selectionEnd;const upper=noteInput.value.toLocaleUpperCase('it-IT');if(upper!==noteInput.value){noteInput.value=upper;noteInput.setSelectionRange(start,end);}collect();});
 const servicesSymbol=el('span',{class:'plus-disc','aria-hidden':'true'},draft.servicesOpen?'−':'+');
 const servicesToggle=el('button',{type:'button',class:'trip-option','aria-expanded':String(Boolean(draft.servicesOpen)),'aria-controls':'trip-services',on:{click:()=>{collect();draft.servicesOpen=!draft.servicesOpen;services.hidden=!draft.servicesOpen;servicesToggle.setAttribute('aria-expanded',String(draft.servicesOpen));servicesSymbol.textContent=draft.servicesOpen?'−':'+';}}},icon('sliders'),el('span',{class:'tile-label'},'Servizi extra'),servicesSymbol);
 options.append(servicesToggle);
 const services=el('div',{class:'service-grid trip-service-editor',id:'trip-services',hidden:!draft.servicesOpen},D.SERVICES.map(service=>el('label',{class:'service-chip'},el('input',{type:'checkbox',name:'service',value:service.key,'aria-label':service.label,checked:draft.services.includes(service.key),on:{change:()=>{collect();updateEstimate();}}}),el('span',{class:'chip-check','aria-hidden':'true'},'✓'),service.label)));
 form.append(services);
 const estimate=el('div',{class:'preview-total'});const saturdayNote=el('p',{class:'saturday-note',role:'status',hidden:true});const missing=el('p',{class:'missing-note'});form.append(estimate,saturdayNote,missing);
 const save=el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),editingId?'Salva modifiche':'Salva viaggio');
 form.append(save,el('p',{class:'privacy-footnote'},icon('lock'),'Tariffe e note restano nell’app, mai nel PDF.'));
 function collect(){draft={date:date.input.value,container:container.input.value,client:client.input.value,city:city.input.value,secondClient:secondClient?.input.value||'',secondCity:secondCity?.input.value||'',services:[...form.querySelectorAll('[name=service]:checked')].map(n=>n.value),second:draft.second,note:noteInput.value,noteOpen:Boolean(draft.noteOpen),servicesOpen:Boolean(draft.servicesOpen)};}
 function updateEstimate(){
  collect();
  const firstTariff=companyRatesLoaded?D.findTariff({tariffs:companyRates},draft.client,draft.city):null;
  const existing=state.trips.find(trip=>trip.id===editingId)||null;
  const sameFirst=existing&&D.normalizeText(existing.client)===D.normalizeText(draft.client)&&D.normalizeText(existing.city)===D.normalizeText(draft.city);
  const sameSecond=existing&&D.normalizeText(existing.secondClient)===D.normalizeText(draft.secondClient)&&D.normalizeText(existing.secondCity)===D.normalizeText(draft.secondCity);
  const extraCents=D.emptyExtraRates();
  for(const service of draft.services)
   extraCents[service]=companyExtraSnapshot(companyExtraRates,companyExtrasLoaded,service,{
    unchanged:Boolean(existing?.services?.includes(service)),
    previous:existing?.extraCents?.[service]});
  // Build a read-only candidate even while required fields are incomplete.
  // Replace the edited trip so its own daily allowance is not counted twice.
  const candidate={...draft,id:estimateId,createdAt:existing?.createdAt||estimateCreatedAt,
   fareCents:companyFareSnapshot(companyRates,companyRatesLoaded,draft.client,draft.city,{unchanged:Boolean(sameFirst),previous:existing?.fareCents}),
   secondFareCents:draft.second&&draft.secondCity?companyFareSnapshot(companyRates,companyRatesLoaded,draft.secondClient,draft.secondCity,{unchanged:Boolean(sameSecond),previous:existing?.secondFareCents}):null,
   sumPickupFares:Boolean(draft.second&&draft.secondCity),extraCents};
  const previewContext=D.buildTripAmountContext([...state.trips.filter(trip=>trip.id!==editingId),candidate]);
  const amount=D.tripAmounts(candidate,previewContext);const saturday=D.saturdayAllowanceStatus(candidate,previewContext);
  hint.textContent=firstTariff?`Tariffa aziendale · ${D.formatMoney(firstTariff.cents)}`:'';
  estimate.replaceChildren(el('span',{},icon('wallet'),draft.second?'Trasferte + extra':'Trasferta + extra'),draft.client&&draft.city?el('strong',{},D.formatMoney(amount.totalCents)):el('small',{},'Scegli cliente e città'));
  saturdayNote.textContent=saturdayNoteText(saturday.status);saturdayNote.hidden=saturday.status==='none';saturdayNote.dataset.saturdayStatus=saturday.status;
  const hasAny=Boolean(draft.client||draft.city||draft.services.length);const unknown=(candidate.fareCents===null&&Boolean(draft.client&&draft.city))||(draft.second&&candidate.secondFareCents===null&&Boolean(draft.secondClient&&draft.secondCity))||draft.services.some(key=>extraCents[key]===null&&!(key==='sabatoTrasferta'&&saturday.status==='included'));
  missing.textContent=hasAny&&unknown?'Alcune tariffe non sono impostate. Puoi comunque salvare il viaggio.':'';
  missing.style.marginBottom=missing.textContent?'16px':'0';
 }
 for(const {input}of[date,container,client,city,...(secondClient?[secondClient,secondCity]:[])])input.addEventListener('input',()=>{collect();updateEstimate();});
 client.input.addEventListener('change',()=>{autofillCity(client.input,city.input);const next=datalist(cityListId,citySuggestions(client.input.value));cities.replaceWith(next);cities=next;updateEstimate();});
 container.input.addEventListener('blur',()=>{container.input.value=D.normalizeContainer(container.input.value);collect();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;collect();error.textContent='';form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  const checked=D.validateTrip(draft);
  if(!checked.valid){error.textContent=Object.values(checked.errors)[0];const firstKey=Object.keys(checked.errors)[0];if(firstKey==='note'){draft.noteOpen=true;noteEditor.hidden=false;noteToggle.setAttribute('aria-expanded','true');noteSymbol.textContent='−';}const firstBad=form.elements[firstKey];if(firstBad instanceof HTMLElement){firstBad.setAttribute('aria-invalid','true');firstBad.focus();}return;}
  save.disabled=true;
  try{
   const existing=state.trips.find(t=>t.id===editingId)||null;
   if(editingId&&tripEditVersion(existing)!==editingBaseline)throw new Error('Il viaggio è stato aggiornato o eliminato su un altro dispositivo. La bozza è conservata: annulla la modifica e riapri il viaggio aggiornato dal Registro.');
   const trip=D.createTrip(draft,{...state,tariffs:[]},existing);
   const sameFirst=Boolean(existing&&D.normalizeText(existing.client)===trip.client&&D.normalizeText(existing.city)===trip.city);
   const sameSecond=Boolean(existing&&D.normalizeText(existing.secondClient)===trip.secondClient&&D.normalizeText(existing.secondCity)===trip.secondCity);
   trip.fareCents=companyFareSnapshot(companyRates,companyRatesLoaded,trip.client,trip.city,{unchanged:sameFirst,previous:existing?.fareCents});
   trip.secondFareCents=trip.secondCity?companyFareSnapshot(companyRates,companyRatesLoaded,trip.secondClient,trip.secondCity,{unchanged:sameSecond,previous:existing?.secondFareCents}):null;
   // Override legacy private defaults: company extras are identical for all drivers.
   // Previously saved service amounts are snapshots and are never repriced here.
   for(const service of trip.services)
    trip.extraCents[service]=companyExtraSnapshot(companyExtraRates,companyExtrasLoaded,service,{
     unchanged:Boolean(existing?.services?.includes(service)),
     previous:existing?.extraCents?.[service]});
   let next={...state,trips:existing?state.trips.map(t=>t.id===existing.id?trip:t):[...state.trips,trip]};
   const clients=[{name:trip.client,city:trip.city},...(trip.secondClient?[{name:trip.secondClient,city:trip.secondCity}]:[])];
   for(const customer of clients)if(!next.customers.some(c=>c.name===customer.name))next=D.upsertCustomer(next,customer);
   await persist(next);const savedDate=draft.date;editingId=null;editingBaseline=null;draft={...newDraft(),date:savedDate};render();toast(existing?'Viaggio aggiornato.':'Viaggio salvato nel registro.');
  }catch(err){error.textContent=err.message||'Salvataggio non riuscito. Riprova.';save.disabled=false;}
 });
 refreshTripFareEstimate=updateEstimate;
 updateEstimate();layout.append(form);
 const recent=el('aside',{class:'recent-preview'},el('p',{class:'recent-heading'},'L’ULTIMO VIAGGIO'));
 const latest=D.sortTrips(state.trips)[0];
 recent.append(latest?tripCard(latest,amountContext):emptyState('Pronto a partire','Inserisci il primo viaggio: lo ritroverai qui e nel resoconto mensile.','truck'));
 recent.append(el('p',{class:'hint-row'},icon('info'),'Clienti e località vengono ricordati.'));
 layout.append(recent);main.append(layout);
 refreshView=()=>{
  client.input.value=draft.client;if(secondClient)secondClient.input.value=draft.secondClient;
  updateEstimate();
  const list=form.querySelector(`#${customerListId}`);
  list?.replaceWith(datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client),...companyCustomers.map(c=>c.name)]));
  const nextCities=datalist(cityListId,citySuggestions(client.input.value));cities.replaceWith(nextCities);cities=nextCities;
  refreshTripCustomerSuggestions?.();
  if(secondClient){const list=form.querySelector('#second-cities');list?.replaceWith(datalist('second-cities',citySuggestions(secondClient.input.value)));}
  const latest=D.sortTrips(state.trips)[0];
  const currentAmounts=D.buildTripAmountContext(state);
  recent.replaceChildren(el('p',{class:'recent-heading'},'L’ULTIMO VIAGGIO'),latest?tripCard(latest,currentAmounts):emptyState('Pronto a partire','Inserisci il primo viaggio: lo ritroverai qui e nel resoconto mensile.','truck'),el('p',{class:'hint-row'},icon('info'),'Clienti e località vengono ricordati.'));
 };
}
function citySuggestions(client){const normalized=D.normalizeText(client);return unique([...companyRates.filter(t=>t.client===normalized).map(t=>t.city),...state.tariffs.filter(t=>t.client===normalized).map(t=>t.city),...state.customers.filter(c=>c.name===normalized).map(c=>c.city),...state.trips.filter(t=>t.client===normalized).map(t=>t.city),...companyCustomers.filter(c=>D.normalizeText(c.name)===normalized).map(c=>D.normalizeText(c.city))]);}
function autofillCity(client,city){if(!city.value.trim()){const normalized=D.normalizeText(client.value);const tariffCities=unique(companyRates.filter(t=>t.client===normalized).map(t=>t.city));if(tariffCities.length===1)city.value=tariffCities[0];else if(!tariffCities.length){const customer=state.customers.find(c=>c.name===normalized);if(customer?.city)city.value=customer.city;else{const values=citySuggestions(client.value);if(values.length===1)city.value=values[0];}}}}
function editTrip(trip,{focusNote=false}={}){editingId=trip.id;editingBaseline=tripEditVersion(trip);draft={...trip,services:[...trip.services],second:Boolean(trip.secondClient||trip.secondCity),note:trip.note||'',noteOpen:focusNote||Boolean(trip.note),servicesOpen:true};navigate('insert');if(focusNote)document.querySelector('#trip-note')?.focus();}
function repeatRoute(trip){
 const apply=()=>{
  editingId=null;
  editingBaseline=null;
  draft=quickTripFromRoute(trip,today());
  navigate('insert');
  document.querySelector('input[name="container"]')?.focus();
  toast('Percorso pronto. Inserisci il nuovo container e controlla i dati prima di salvare.');
 };
 // A route shortcut must not silently replace work typed into the current form.
 const filled=Boolean(editingId||draft.container.trim()||draft.client.trim()||
  draft.city.trim()||draft.second||draft.services.length||draft.note.trim());
 if(filled)confirmAction('Usare questo percorso?',
  'I dati già compilati nel modulo saranno sostituiti. Il viaggio originale non verrà modificato.',
  apply,'Usa percorso');
 else apply();
}
function saturdayNoteText(status){return status==='included'?'SABATO TRASFERTA già conteggiato per questa data':status==='applied'?'SABATO TRASFERTA conteggiato una sola volta nella giornata':'';}
function tripCard(trip,amountContext){
 const amount=D.tripAmounts(trip,amountContext);const saturday=D.saturdayAllowanceStatus(trip,amountContext);
 const card=el('article',{class:'panel trip-card'},el('div',{class:'trip-meta'},el('span',{class:'date-badge'},formatDate(trip.date)),el('span',{class:'trip-money',title:amount.missingTariff?'Totale parziale: alcune tariffe non sono impostate':'Trasferta ed extra'},D.formatMoney(amount.totalCents),amount.missingTariff?' *':'')),el('h3',{class:'trip-container'},trip.container),el('p',{class:'trip-client'},trip.client),el('p',{class:'trip-location'},icon('pin'),trip.city));
 if(trip.secondClient)card.append(el('p',{class:'trip-location'},icon('plus'),`${trip.secondClient} · ${trip.secondCity}`));
 if(trip.services.length)card.append(el('div',{class:'trip-services'},trip.services.map(key=>el('span',{class:'mini-chip'},D.SERVICES.find(s=>s.key===key)?.label||key))));
 if(trip.note)card.append(el('p',{class:'trip-note-summary'},el('span',{class:'trip-note-prefix'},'Nota:'),el('span',{class:'trip-note-text',title:trip.note},trip.note)));
 else card.append(el('button',{type:'button',class:'trip-option trip-note-add','aria-label':`INSERISCI NOTA · ${trip.container} · ${formatDate(trip.date)}`,on:{click:()=>editTrip(trip,{focusNote:true})}},el('span',{class:'plus-disc','aria-hidden':'true'},'+'),'INSERISCI NOTA'));
 if(saturday.status!=='none')card.append(el('p',{class:'saturday-note',dataset:{saturdayStatus:saturday.status}},saturdayNoteText(saturday.status)));
 card.append(el('div',{class:'trip-card-footer'},el('p',{class:'trip-breakdown'},`Prese ${D.formatMoney(amount.pickupCents)} · Extra ${D.formatMoney(amount.extraCents)}`),el('div',{class:'inline-actions'},el('button',{type:'button',class:'icon-button','aria-label':`Modifica viaggio ${trip.container} del ${formatDate(trip.date)}`,on:{click:()=>editTrip(trip)}},icon('edit')),el('button',{type:'button',class:'icon-button danger','aria-label':`Elimina viaggio ${trip.container} del ${formatDate(trip.date)}`,on:{click:()=>confirmAction('Eliminare questo viaggio?',`${trip.container} · ${formatDate(trip.date)}. Il viaggio sarà rimosso dal registro.`,async()=>{requireCurrentEditor(editorVersion(trip),state.trips.find(current=>current.id===trip.id),'Il viaggio');await persist({...state,trips:state.trips.filter(t=>t.id!==trip.id)});render();toast('Viaggio eliminato.');})}},icon('trash')))));
 card.append(el('button',{type:'button',class:'trip-repeat-action',
  'aria-label':`Ripeti percorso ${trip.client}, ${trip.city}. Nuovo viaggio senza container e servizi.`,
  on:{click:()=>repeatRoute(trip)}},icon('refresh'),'Ripeti percorso'));
 return card;
}
function renderRegister(main){
 if(activationWelcome){
  const needsProfile=!state.profile.firstName||!state.profile.lastName;
  main.append(el('section',{class:'activation-register-welcome',role:'status','aria-live':'polite','aria-label':'Conferma attivazione account'},
    el('span',{class:'activation-register-check','aria-hidden':'true'},icon('check')),
    el('div',{class:'activation-register-text'},
      el('strong',{},'Account attivato. Benvenuto in LTS!'),
      el('p',{},'Il tuo Registro Viaggi è aperto e collegato al tuo account. I viaggi precedenti restano conservati.'),
      needsProfile?el('p',{class:'activation-register-tip'},'Completa nome e cognome dal profilo per personalizzare il registro.'):null),
    needsProfile?button('Completa profilo','secondary',()=>openProfile(true),'users',{class:'secondary-button activation-profile-action'}):null,
    button('Chiudi','text',()=>{activationWelcome=false;render();},'close',
      {class:'text-button activation-register-dismiss','aria-label':'Chiudi conferma attivazione'})));
 }
 main.append(heading('TUTTO AL SUO POSTO','Registro mensile','I tuoi viaggi, dal più recente al meno recente.',el('div',{class:'month-control'},el('label',{class:'visually-hidden',for:'month-select'},'Mese del registro'),el('span',{class:'month-caption','aria-hidden':'true'},D.formatMonth(month)),el('input',{id:'month-select',type:'month',value:month,min:'1900-01',max:'2199-12',on:{change:event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){month=event.target.value;pdfReport=null;render();}}}}))));
 const amountContext=D.buildTripAmountContext(state);const summary=D.monthlySummary(state,month);const trips=D.monthlyTrips(state,month);
 main.append(el('section',{class:'panel overview','aria-label':'Riepilogo del mese'},el('div',{class:'overview-top'},el('div',{},el('p',{class:'overview-label'},'Totale trasferte ed extra'),el('p',{class:'overview-amount'},D.formatMoney(summary.totalCents))),el('span',{class:'trip-count'},`${summary.count} ${summary.count===1?'viaggio':'viaggi'}`)),el('div',{class:'overview-bottom'},el('div',{},'TRASFERTE',el('strong',{},D.formatMoney(summary.pickupCents))),el('div',{},'SERVIZI EXTRA',el('strong',{},D.formatMoney(summary.extraCents))))));
 if(summary.missingTariffCount)main.append(el('p',{class:'missing-note',style:'margin-top:10px'},`${summary.missingTariffCount} ${summary.missingTariffCount===1?'viaggio ha tariffe mancanti':'viaggi hanno tariffe mancanti'}: il totale potrebbe essere parziale.`));
 if(trips.some(trip=>D.saturdayAllowanceStatus(trip,amountContext).status==='included'))main.append(el('p',{class:'saturday-summary-note'},'SABATO TRASFERTA è conteggiato una sola volta per data. Le trasferte di tutti i viaggi si sommano.'));
 const pdf=el('button',{type:'button',class:'pdf-button',disabled:!trips.length,on:{click:async()=>{
  pdf.disabled=true;try{
   const module=await import('/LTS-Registro-Viaggi/shared/pdf.mjs');const logo=await module.loadPdfLogo();pdfReport=module.generateMonthlyPdf({state,month,logoDataUrl:logo});render();toast('PDF pronto: aprilo o condividilo.');
  }catch(err){toast(err.message||'Impossibile creare il PDF.',true);pdf.disabled=false;}
 }}},icon('pdf'),'Genera PDF');
 main.append(el('div',{class:'month-row'},el('h2',{},'Viaggi del mese'),pdf));
 if(pdfReport){const report=pdfReport;main.append(el('div',{class:'panel pdf-ready'},icon('pdf'),el('p',{},'Il tuo resoconto è pronto',el('small',{},`${report.pages} ${report.pages===1?'pagina':'pagine'} · senza importi`)),button('Apri / condividi','secondary',async()=>{try{const module=await import('/LTS-Registro-Viaggi/shared/pdf.mjs');await module.shareOrDownloadPdf(report);}catch(err){if(err.name!=='AbortError')toast(err.message||'Impossibile aprire il PDF.',true);}},'share')));}
 if(trips.length)main.append(el('div',{class:'trip-list',style:pdfReport?'margin-top:16px':''},trips.map(trip=>tripCard(trip,amountContext))));
 else main.append(emptyState('Il mese è tutto da scrivere','Qui compariranno i viaggi inseriti per il mese selezionato.','calendar',button('Inserisci un viaggio','primary',()=>navigate('insert'),'plus')));
 main.append(el('p',{class:'subtle-footer'},'Scorri liberamente: tutti i viaggi del mese sono qui.'));
}
function searchBox(placeholder,onSearch){const input=el('input',{type:'search',placeholder,value:searchValue,'aria-label':placeholder,autocapitalize:'characters',on:{input:event=>{searchValue=event.target.value;onSearch();}}});return el('div',{class:'search'},icon('search'),input);}
/** Compact customer cards: operational notes and tariff values are kept out of this list. */
function customerCard(customer,{shared=false}={}){
 const city=String(customer.city||'').trim();
 const address=String(customer.address||'').trim();
 const phone=String(customer.phone||'').trim();
 const dial=phone.replace(/[^0-9+]/gu,'');
 const canCall=/^\+?[0-9]{5,16}$/u.test(dial);
 const actions=el('div',{class:'directory-card-actions'},
  el('button',{type:'button',class:'secondary-button directory-use-customer',
   on:{click:()=>useCustomerInTrip(customer)}},icon('plus'),'Usa nel viaggio'));
 if(shared&&customer.mapsUrl)actions.append(el('a',{class:'directory-open-maps',href:customer.mapsUrl,
  target:'_blank',rel:'noopener noreferrer',
  'aria-label':`Apri Google Maps per ${customer.name}`},icon('pin'),'Apri Maps'));
 else if(!shared)actions.append(el('button',{type:'button',class:'text-button directory-edit-customer',
  on:{click:()=>customerDialog(customer)},
  'aria-label':`Modifica cliente ${customer.name}`},icon('edit'),'Modifica'));
 const content=el('div',{class:'directory-card-content'},
  el('div',{class:'directory-card-title'},el('h3',{},customer.name),
   el('span',{class:shared?'customer-source shared':'customer-source personal'},
    shared?'Aziendale':'Personale')),
  city?el('p',{class:'directory-card-city'},el('span',{class:'directory-field-label'},'Località'),el('span',{},city)):null,
  address?el('p',{class:'directory-card-address'},el('span',{class:'directory-field-label'},'Via'),el('span',{class:'directory-address-text',title:address},address)):null,
  phone?el('p',{class:'directory-card-phone'},el('span',{class:'directory-field-label'},'Telefono'),
   canCall?el('a',{href:'tel:'+dial,'aria-label':`Chiama ${phone}`},icon('phone'),phone):el('span',{},phone)):null);
 return el('article',{class:'panel customer-card directory-card'},content,actions);
}
function renderCustomers(main){
 main.append(heading('LA TUA RUBRICA','Clienti','Cerca una sede o scegli un cliente per il prossimo viaggio.'));
 main.append(companyCustomersPanel());
 refreshView=()=>updateCompanyCustomersPanel();
}
function renderTariffs(main){
 main.append(heading('IL VALORE DEI TUOI VIAGGI','Tariffe & extra',
  'Un solo tariffario aziendale, con importi uguali per tutti gli autisti.'));
 main.append(el('div',{class:'segment','aria-label':'Tipo di tariffa'},
  el('button',{type:'button',class:tariffTab==='base'?'selected':'','aria-pressed':tariffTab==='base',
   on:{click:()=>{tariffTab='base';searchValue='';render();}}},'Trasferte'),
  el('button',{type:'button',class:tariffTab==='extras'?'selected':'','aria-pressed':tariffTab==='extras',
   on:{click:()=>{tariffTab='extras';render();}}},'Servizi extra')));
 if(tariffTab==='extras'){renderExtraRates(main);return;}
 const list=el('div',{class:'catalog-list company-route-catalog'}),
  count=el('span',{class:'catalog-count'});
 const companyStatus=el('span',{class:'company-rate-sync-status'},
  'Il tariffario aziendale si aggiorna quando sei online.');
 const refresh=el('button',{type:'button',class:'secondary-button',on:{click:async()=>{
  refresh.disabled=true;companyStatus.textContent='Aggiornamento tariffe in corso…';
  try{
   await Promise.all([store.syncPending(),refreshCompanyRates({quiet:false})]);
   companyStatus.textContent=companyRates.length?'Trasferte aziendali aggiornate.':'Nessuna trasferta aziendale ancora configurata.';
   toast(companyRates.length?'Tariffe aziendali sincronizzate.':'Il listino aziendale è ancora vuoto.');
  }catch(error){
   companyStatus.textContent=error?.message||'Aggiornamento non disponibile: i dati salvati restano conservati.';
   toast('Non è stato possibile aggiornare le tariffe. Controlla la connessione.',true);
  }finally{refresh.disabled=false;}
 }}},icon('refresh'),'Aggiorna');
 main.append(el('div',{class:'info-note tariff-company-sync','aria-label':'Sincronizzazione tariffe aziendali'},
  icon('lock'),companyStatus,refresh));
 function draw(){
  const results=filterSharedCustomers(companyRates.map(rate=>({...rate,name:rate.client})),searchValue)
   .sort((a,b)=>a.client.localeCompare(b.client,'it')||a.city.localeCompare(b.city,'it'));
  const grouped=new Map();
  for(const rate of results){
   if(!grouped.has(rate.client))grouped.set(rate.client,[]);
   grouped.get(rate.client).push(rate);
  }
  count.textContent=searchValue.trim()
   ?`${results.length} di ${companyRates.length} trasferte trovate`
   :`${companyRates.length} ${companyRates.length===1?'trasferta aziendale':'trasferte aziendali'}`;
  if(!companyStatus.textContent.includes('corso')&&!companyStatus.textContent.includes('aggiornate')&&
     !companyStatus.textContent.includes('Errore')&&!companyStatus.textContent.includes('possibile'))
   companyStatus.textContent=companyRatesLoaded
    ?companyRates.length?'Prezzi aziendali · uguali per tutti gli autisti.'
     :'Il listino è vuoto: l’amministratore deve inserire le trasferte.'
    :'In attesa del tariffario aziendale. Aggiorna con Internet attivo.';
  list.replaceChildren(...[...grouped].map(([client,rows])=>
   el('article',{class:'panel tariff-card company-route-card'},
    el('div',{class:'company-route-heading'},el('h2',{},client),
     el('span',{},`${rows.length} ${rows.length===1?'località':'località'}`)),
    el('ul',{class:'company-route-list'},...rows.map(rate=>
     el('li',{},el('span',{},rate.city),el('strong',{},D.formatMoney(rate.cents))))))));
  if(!results.length)list.append(emptyState(searchValue.trim()?'Nessuna tariffa trovata':
    companyRatesLoaded?'Nessuna trasferta configurata':'Tariffario in aggiornamento',
    searchValue.trim()?'Prova con un altro cliente o una località.':
    'Gli importi vengono inseriti dall’amministratore e saranno uguali per tutti gli autisti.',
    'wallet'));
 }
 main.append(searchBox('Cerca cliente o località',draw),
  el('div',{class:'catalog-top'},count),list);
 draw();refreshView=draw;
}
function renderExtraRates(main){
 main.append(el('div',{class:'info-note'},icon('lock'),
  'Servizi extra aziendali: un importo unico per tutti gli autisti, impostato dall’amministratore. I viaggi già salvati conservano gli importi storici.'));
 const list=el('div',{class:'panel form-panel extras-panel rates-list'});
 const status=el('p',{class:'field-hint'});
 const update=el('button',{type:'button',class:'secondary-button',on:{click:async()=>{
  update.disabled=true;status.textContent='Aggiornamento degli extra aziendali…';
  try{await refreshCompanyRates({quiet:false});show();}
  catch(error){status.textContent=error.message||'Aggiornamento non disponibile.';}
  finally{update.disabled=false;}
 }}},icon('refresh'),'Aggiorna servizi extra');
 function show(){
  list.replaceChildren(...D.SERVICES.map(service=>{
   const price=companyExtraSnapshot(companyExtraRates,companyExtrasLoaded,service.key);
   return el('div',{class:'rate-row'},el('span',{},service.label),
    el('strong',{},price===null?'Da configurare':D.formatMoney(price)));
  }));
  status.textContent=companyExtrasLoaded
   ?'Listino aziendale sincronizzato: gli importi sono uguali per tutti gli autisti.'
   :'Listino non ancora disponibile. Collegati a Internet e premi Aggiorna.';
 }
 main.append(list,status,update);
 show();refreshView=show;
}
function modal(title,{required=false,subtitle=null}={}){
 const dialog=el('dialog',{class:'dialog','aria-label':title});const body=el('div',{class:'dialog-inner'});const header=el('div',{class:'dialog-header'},el('h2',{},title));
 if(!required)header.append(el('button',{type:'button',class:'dialog-close','aria-label':'Chiudi',on:{click:()=>dialog.close()}},icon('close')));
 body.append(header);if(subtitle)body.append(el('p',{class:'subtitle'},subtitle));dialog.append(body);
 dialog.addEventListener('close',()=>dialog.remove());if(required)dialog.addEventListener('cancel',event=>event.preventDefault());
 document.body.append(dialog);dialog.showModal();return{dialog,body};
}
function confirmAction(title,message,callback,confirmLabel='Elimina'){
 const {dialog,body}=modal(title);body.append(el('p',{class:'profile-description'},message));const error=el('div',{class:'form-error',role:'alert'});body.append(error);
 const confirm=button(confirmLabel,confirmLabel==='Elimina'?'secondary danger':'primary',async()=>{confirm.disabled=true;try{await callback();dialog.close();}catch(err){error.textContent=err.message||'Operazione non riuscita.';confirm.disabled=false;}});
 body.append(el('div',{class:'dialog-actions'},button('Annulla','secondary',()=>dialog.close()),confirm));
}
/** One field: the Maps URL. Successful registration also remembers it locally
 * for offline lookup. Missing address/city/name never triggers a manual form. */
function mapsCustomerDialog(){
 const {dialog,body}=modal('Cliente da Google Maps',{subtitle:
  'Incolla il link condiviso dalla scheda di un luogo su Google Maps. Potrai verificare e completare i dati prima del salvataggio.'});
 const form=el('form',{novalidate:true});
 const input=el('input',{type:'url',name:'mapsUrl',
  placeholder:'https://maps.app.goo.gl/…',autocapitalize:'none',spellcheck:'false',
  autocomplete:'off',maxlength:4096,'aria-label':'Link Google Maps'});
 const error=el('div',{class:'form-error',role:'alert'});
 const submit=el('button',{type:'submit',class:'primary-button full'},icon('pin'),'Leggi link');
 const help=el('p',{class:'field-hint',hidden:true});
 const manual=button('Compila manualmente','text',()=>{
  dialog.close();customerDialog();
  toast('Il cliente inserito senza verifica del link rimane personale.');
 },null,{class:'text-button full'});
 form.append(el('label',{class:'field'},el('span',{},'Link Google Maps'),input),
  error,help,submit,manual);
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.textContent='';help.hidden=true;
  const link=input.value.trim();
  if(!link){error.textContent='Incolla un link Google Maps.';input.focus();return;}
  submit.disabled=true;submit.textContent='Lettura in corso…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  try{
   const proposal=await readMapsCustomer(link,{signal:controller.signal});
   if(!dialog.open)return;
   dialog.close();customerDialog(null,proposal);
  }catch(err){
   if(!dialog.open)return;
   error.textContent=err.name==='AbortError'
    ?'Google Maps non ha risposto in tempo. Il link resta qui: riprova.'
    :err.message||'Google Maps non disponibile. Riprova.';
   help.hidden=false;
   help.textContent='Se il link non si risolve, apri il luogo su Google Maps → Condividi → Copia link. '+
    'In alternativa puoi aggiungere il cliente manualmente alla tua rubrica personale.';
  }finally{clearTimeout(timeout);submit.disabled=false;submit.replaceChildren(icon('pin'),'Leggi link');}
 });
 body.append(form);input.focus();
}
async function importCustomersCsv(file){
 try{
  if(file.size>MAX_CUSTOMER_CSV_BYTES)throw new Error('Il CSV non deve superare 2 MB.');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('Salva il CSV in formato UTF-8 e riprova.');}
  const rows=parseCustomerCsv(text);const preview=mergeCustomerCsv(state,rows);
  const {dialog,body}=modal('Importa clienti CSV',{subtitle:`${preview.count} clienti nel file: ${preview.added} nuovi, ${preview.updated} da aggiornare.`});
  body.append(el('p',{class:'profile-description'},'Vengono aggiornati solo i campi compilati dei clienti con lo stesso nome. Gli altri clienti, le tariffe e i viaggi restano conservati.'),el('ul',{class:'csv-preview'},rows.slice(0,5).map(row=>el('li',{},el('strong',{},row.name),el('span',{},[row.city,row.address].filter(Boolean).join(' · '))))));
  if(rows.length>5)body.append(el('p',{class:'field-hint'},`E altri ${rows.length-5} record nel file.`));
  const error=el('div',{class:'form-error',role:'alert'});const confirm=button('Importa clienti','primary',async()=>{confirm.disabled=true;error.textContent='';try{const next=mergeCustomerCsv(state,rows);await persist(next.state);dialog.close();render();toast(`${next.count} clienti controllati: rubrica aggiornata.`);}catch(err){error.textContent=err.message;confirm.disabled=false;}});
  body.append(error,el('div',{class:'dialog-actions'},button('Annulla','secondary',()=>dialog.close()),confirm));
 }catch(err){toast(err.message||'Impossibile leggere il CSV.',true);}
}
function customerDialog(customer=null,proposal=null,{focusRates=false}={}){
 const expectedCustomer=editorVersion(customer);
 const seed=customer||proposal;const {dialog,body}=modal(customer?'Modifica cliente':proposal?'Controlla cliente da Maps':'Nuovo cliente',{subtitle:proposal?'Controlla nome, città e indirizzo. Completa i dati mancanti: il cliente sarà aggiunto solo premendo Salva cliente.':'Inserisci i recapiti utili. Il telefono è facoltativo.'});const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});
 if(proposal?.warnings?.length)form.append(el('p',{class:'info-note'},proposal.warnings.join(' ')));
 if(proposal?.mapsUrl&&sharedMapsEnabled()){
  form.append(el('p',{class:'info-note'},'Dopo Salva cliente LTS aggiornerà la lista aziendale usando il link Google Maps e i dati di questa scheda che hai controllato. I clienti inseriti manualmente restano personali.'));
 }
 const customerName=field('Nome cliente','name',seed?.name||'',{placeholder:'Ragione sociale',required:true,maxlength:500});const city=field('Località','city',seed?.city||'',{placeholder:'Città',optional:true,maxlength:500});const address=field('Indirizzo','address',seed?.address||'',{placeholder:'Via e numero civico',optional:true,maxlength:1000});const vat=field('Partita IVA','vat',seed?.vat||'',{placeholder:'Partita IVA',optional:true,maxlength:100});
 const phone=field('Telefono','phone',seed?.phone||'',{placeholder:'Numero di telefono (facoltativo)',optional:true,maxlength:40,type:'tel',inputmode:'tel'});
 if(proposal?.mapsUrl){
  form.append(error,customerName.wrap,city.wrap,address.wrap);
  form.append(el('p',{class:'field-hint'},'Le sedi con link Google Maps sono condivise. I recapiti personali non vengono pubblicati.'));
 }else form.append(error,customerName.wrap,city.wrap,address.wrap,phone.wrap,vat.wrap);
 form.append(el('p',{class:'info-note'},icon('lock'),'Le trasferte sono uguali per tutti gli autisti e si modificano solo dal tariffario aziendale.'));
 const actions=el('div',{class:'dialog-actions'});
 if(customer)actions.append(button('Elimina','secondary danger',()=>{
  dialog.close();confirmAction('Eliminare questo cliente?',`${customer.name}. Saranno rimosse anche le sue tariffe. I viaggi già salvati resteranno nel registro.`,async()=>{requireCurrentEditor(expectedCustomer,state.customers.find(current=>current.id===customer.id),'Il cliente');await persist({...state,customers:state.customers.filter(c=>c.id!==customer.id),tariffs:state.tariffs.filter(t=>t.customerId!==customer.id&&t.client!==customer.name)});render();toast('Cliente eliminato.');});
 }));
 actions.append(el('button',{type:'submit',class:'primary-button','data-save':true},'Salva cliente'));form.append(actions);
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{
  if(customer)requireCurrentEditor(expectedCustomer,state.customers.find(current=>current.id===customer.id),'Il cliente');
  const candidate={name:customerName.input.value,city:city.input.value,address:address.input.value,
   vat:vat.input.value,phone:phone.input.value};
  // Maps entries go straight to the protected shared register. The backend
  // deduplicates both a repeated Maps link and normalized company/site/street.
  // A Maps save must not first create a second, private customer entry.
  const mapsLink=mapsLinkForCompanySync({existingCustomer:customer,proposal,enabled:sharedMapsEnabled()});
  if(mapsLink){
   const shared=await saveSharedMapsCustomer(mapsLink,candidate);
   await refreshCompanyCustomers();
   dialog.close();render();
   toast(shared.created?'Sede aggiunta all’elenco aziendale condiviso.':
    shared.updated?'Sede aziendale già presente: indirizzo aggiornato.':
    'Sede già presente nell’elenco condiviso: nessun duplicato creato.');
   return;
  }
  // For a new manual customer, check the latest server-side shared registry
  // before writing a personal copy. Offline never modifies the shared list.
  if(!customer&&sharedMapsEnabled()&&store.usingAccount()&&accountAccess.isVerified()&&navigator.onLine!==false){
   try{
    const latest=await sharedMapsCustomers();
    if(Array.isArray(latest)){
     companyCustomers=latest;companyCustomersLoaded=true;companyCustomersError='';
    }
   }catch{
    // Keep offline-first personal saves available. The directory will hide a
    // matching private row once the company registry is reachable again.
    companyCustomersError='Confronto online temporaneamente non disponibile.';
   }
  }
  const existingShared=matchingSharedCustomer(companyCustomers,candidate);
  if(!customer&&existingShared){
   error.textContent='Cliente già presente nella rubrica aziendale: '+
    existingShared.name+' · '+existingShared.city+'. Non occorre inserirlo di nuovo.';
   error.scrollIntoView({block:'nearest'});
   return;
  }
  const next=D.upsertCustomer(state,{id:customer?.id,...candidate});
  await persist(next);
  dialog.close();render();
  toast('Cliente personale salvato. La rubrica aziendale viene aggiornata solo da link Google Maps.');
 }catch(err){error.textContent=err.message;error.scrollIntoView({block:'nearest'});}});body.append(form);
 customerName.input.focus();
}
function openProfile(required=false){
 const expectedProfile=editorVersion(state.profile);
 const {dialog,body}=modal(required?'Benvenuto a bordo':'Il tuo profilo',{required});
 if(required){body.prepend(el('img',{class:'onboarding-logo',src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS'}));body.append(el('div',{class:'onboarding-install','data-install-trigger':true,hidden:isInstalled()},button('Installa app','primary',startInstall,'download',{class:'primary-button full'}),el('p',{},'Porta LTS sulla schermata Home del tuo telefono.')),el('p',{class:'subtitle'},'Inserisci nome e cognome. Compariranno sul tuo resoconto mensile.'));}
 else body.append(el('div',{class:'profile-hero'},el('div',{class:'profile-avatar'},initials()),el('div',{},el('p',{class:'profile-description'},'IL TUO REGISTRO PERSONALE'),el('p',{class:'catalog-title'},name()))));
 const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});const first=field('Nome','firstName',state.profile.firstName,{placeholder:'Il tuo nome',autocomplete:'given-name',required:true,maxlength:200});const last=field('Cognome','lastName',state.profile.lastName,{placeholder:'Il tuo cognome',autocomplete:'family-name',required:true,maxlength:200});
 form.append(error,first.wrap,last.wrap,el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),required?'Inizia a registrare':'Salva profilo'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';if(!first.input.value.trim()||!last.input.value.trim()){error.textContent='Inserisci nome e cognome dell’autista.';(!first.input.value.trim()?first.input:last.input).focus();return;}try{requireCurrentEditor(expectedProfile,state.profile,'Il profilo');await persist({...state,profile:{firstName:D.normalizeText(first.input.value),lastName:D.normalizeText(last.input.value)}});dialog.close();render();toast('Profilo salvato.');}catch(err){error.textContent=err.message;}});body.append(form);
 if(required&&store.usingAccount())body.append(button('Recupera vecchi viaggi','text',()=>{dialog.close();showLegacyArchiveRecovery();},'download',{class:'text-button full'}));
 if(!required){
  const importInput=el('input',{type:'file',accept:'.json,.zip,application/json,application/zip',class:'visually-hidden','aria-label':'Seleziona un backup',on:{change:async event=>{const file=event.target.files?.[0];if(!file)return;dialog.close();await importFile(file);}}});
  const installItem=menuButton('Installa app','Aggiungi LTS alla schermata Home.','download',startInstall);installItem.dataset.installTrigger='';installItem.hidden=isInstalled();
  body.append(el('div',{class:'profile-separator'}),el('p',{class:'section-label'},'I tuoi dati'),el('div',{class:'profile-menu'},menuButton('Sincronizza adesso','Invia online le modifiche salvate sul telefono.','cloud',async()=>{try{const result=await store.syncPending();if(result?.state)state=D.validateState(result.state);dialog.close();render();toast('Sincronizzazione completata.');}catch(err){toast(err.message||'Sincronizzazione non riuscita.',true);}}),menuButton('Esporta backup','Salva una copia in File o su Google Drive.','download',()=>downloadBackup()),menuButton('Importa backup','Backup web JSON o archivio Android ZIP.','upload',()=>importInput.click()),menuButton('Ricarica dati online','Recupera la versione online dopo aver conservato un backup.','refresh',()=>{dialog.close();confirmAction('Ricaricare i dati online?','Prima esporta un backup. Le modifiche non sincronizzate sul telefono saranno sostituite dai dati online.',async()=>{const result=await store.loadState({preferRemote:true});state=D.validateState(result.state);user=result.user||null;draft=newDraft();editingId=null;editingBaseline=null;render();toast('Registro online ricaricato.');},'Ricarica');}),installItem,importInput));
  appendPushSettings(body,{apiRequest:store.pushRequest,toast});
  const syncInfo=store.getSyncInfo();
  if(!store.usingAccount())body.querySelector('.profile-menu').prepend(menuButton('Collega dispositivi',syncInfo.linked?'Archivio condiviso: viaggi, clienti e tariffe si aggiornano online.':'Collega iPhone e Android con un codice temporaneo.','link',()=>{dialog.close();deviceLinkDialog();}));
  if(accountAccess.isEnabled()){
    if(store.usingAccount()&&accountAccess.getRole()==='admin'&&accountAccess.isVerified())
      body.querySelector('.profile-menu').prepend(menuButton('Gestisci autisti',
        'Apri il pannello amministratore con inviti, accessi, rimozioni e reinserimenti.','users',()=>{
          dialog.close();window.location.assign(new URL('amministratore/',import.meta.url).href);
        }));
    if(store.usingAccount()){
      body.querySelector('.profile-menu').prepend(menuButton('Recupera archivio precedente','Salva il vecchio backup e importa i dati conservati su questo telefono.','download',()=>{dialog.close();showLegacyArchiveRecovery();}));
      body.querySelector('.profile-menu').prepend(menuButton('Esci dall’account','Blocca la schermata e conserva il registro online. Prima sincronizza eventuali modifiche.','lock',()=>{
        try{
          store.leaveAccountView();
          void accountAccess.logout().then(result=>{
            if(!result.revoked)toast('Accesso locale chiuso. Revoca online non confermata: riprova con Internet attivo.',true);
          });
          dialog.close();
          document.querySelectorAll('dialog[open]').forEach(node=>node.close());
          renderAccountGate('Sei uscito dal tuo account.');
        }catch(error){toast(error.message,true);}
      }));
    }else{
      body.querySelector('.profile-menu').prepend(menuButton('Accedi con account autista','Numero di telefono e password; l’archivio attuale non viene trasferito automaticamente.','lock',()=>{
        dialog.close();showAccountLogin();
      }));
    }
  }
  if(syncInfo.conflict)body.querySelector('.profile-menu').prepend(menuButton('Risolvi sincronizzazione','Controlla le due copie: nessuna modifica viene scartata automaticamente.','info',()=>{dialog.close();syncConflictDialog();}));
  body.querySelector('.profile-menu').append(menuButton('Esporta per Android','ZIP compatibile da importare nell’app LTS Android.','download',downloadAndroidBackup));
  body.append(el('div',{class:'info-note',style:'margin-top:17px;margin-bottom:0'},icon('lock'),'Il PDF mensile contiene viaggi e servizi. Le tariffe e gli importi restano solo nell’app.'));
  body.append(el('p',{class:'subtle-footer'},store.usingAccount()
    ?'Registro dell’account verificato. I viaggi degli altri account non sono accessibili. Non condividere la password; conserva un backup prima di cambiare telefono.'
    :syncInfo.linked?'Dispositivi collegati allo stesso archivio. Le modifiche si sincronizzano quando l’app è aperta e connessa. Conserva un backup prima di cancellare i dati di Safari.':'Accesso libero del dispositivo, senza password. Puoi passare all’account autista senza trasferimenti automatici dei viaggi.'));
  if(user?.email)body.append(el('p',{class:'subtle-footer'},user.email));
 }
 if(required)first.input.focus();
}
function archiveSummary(value){
 const summary=value?.profile?{...value.profile,trips:value.trips.length,customers:value.customers.length,tariffs:value.tariffs.length}:value||{};
 return el('div',{class:'device-archive-summary'},el('strong',{},[summary.firstName,summary.lastName].filter(Boolean).join(' ')||'Autista da completare'),el('span',{},`${summary.trips||0} viaggi · ${summary.customers||0} clienti · ${summary.tariffs||0} tariffe`));
}
function deviceLinkDialog(){
 const {dialog,body}=modal('Collega dispositivi',{subtitle:'Usa lo stesso archivio su iPhone e Android. Il collegamento richiede un codice personale, senza creare un account.'});
 dialog.dataset.deviceLink='';
 dialog.addEventListener('close',()=>queueMicrotask(()=>{if((!state.profile.firstName||!state.profile.lastName)&&!document.querySelector('dialog[open]'))openProfile(true);}));
 const info=store.getSyncInfo();
 body.append(el('div',{class:'device-link-status'},icon(info.linked?'check':'lock'),info.linked?'Archivio condiviso attivo':'Questo dispositivo ha un archivio personale'));
 if(!runtimeConfig.deviceToken){
  body.append(el('p',{class:'profile-description'},'Per collegare i dispositivi apri LTS dall’indirizzo GitHub. Prima esporta un backup del registro presente in questa pagina.'),button('Esporta backup','secondary',downloadBackup,'download'),el('a',{class:'primary-button full',href:'https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/',style:'margin-top:16px'},'Apri LTS su GitHub'));return;
 }
 body.append(el('p',{class:'profile-description'},'1. Sul dispositivo con il tuo registro genera un codice. 2. Sull’altro dispositivo incollalo e controlla i dati prima di collegare. Non condividere il codice con altre persone.'));
 const error=el('div',{class:'form-error',role:'alert'});const generated=el('div',{class:'device-code-result'});
 const create=button('Genera codice','secondary',async()=>{
  create.disabled=true;error.textContent='';
  try{
   const result=await store.createDeviceLink();
   const code=el('input',{type:'text',readonly:true,value:result.code,autocapitalize:'none',spellcheck:'false','aria-label':'Codice da copiare',class:'device-code'});
   const copy=button('Copia codice','secondary',async()=>{try{await navigator.clipboard.writeText(result.code);copy.textContent='Codice copiato';}catch{code.focus();code.select();toast('Tieni premuto sul codice e scegli Copia.');}},'link');
   generated.replaceChildren(archiveSummary(result.summary),code,copy,el('p',{class:'field-hint'},`Codice monouso, valido fino alle ${new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(result.expiresAt))}.`));
  }catch(err){error.textContent=err.message;}finally{create.disabled=false;}
 },'link');
 const form=el('form',{class:'device-link-form',novalidate:true});
 const input=el('input',{type:'text',name:'deviceLinkCode',autocapitalize:'none',autocomplete:'off',spellcheck:'false',maxlength:100,placeholder:'Incolla il codice','aria-label':'Codice dell’altro dispositivo'});
 const preview=el('div',{class:'device-link-preview'});const submit=el('button',{type:'submit',class:'primary-button full'},icon('link'),'Controlla codice');
 form.append(el('label',{class:'field'},el('span',{class:'field-label'},'Codice dell’altro dispositivo'),input),submit);
 input.addEventListener('input',()=>preview.replaceChildren());
 form.addEventListener('submit',async event=>{
  event.preventDefault();submit.disabled=true;error.textContent='';preview.replaceChildren();const code=input.value.trim();
  try{
   const result=await store.previewDeviceLink(code);
   if(result.alreadyLinked){preview.append(el('p',{class:'info-note'},'Questi dispositivi usano già lo stesso archivio. Premi Sincronizza adesso nel profilo per aggiornare i dati.'));return;}
   const selectedCode=code;
   const preference=el('select',{'aria-label':'Dati da preferire in caso di differenze'},el('option',{value:'remote'},'Preferisci il dispositivo che ha generato il codice'),el('option',{value:'local'},'Preferisci questo dispositivo'));
   preview.append(el('p',{class:'section-label'},'Archivio da collegare'),archiveSummary(result.summary),el('p',{class:'section-label',style:'margin-top:17px'},'Su questo dispositivo'),archiveSummary(state),el('p',{class:'profile-description'},'Viaggi, clienti e tariffe dei due archivi saranno uniti. I viaggi con identificativi diversi vengono mantenuti: controlla eventuali doppioni dopo il collegamento. La copia precedente resta conservata.'),el('label',{class:'field',style:'margin-top:16px'},el('span',{class:'field-label'},'Se lo stesso dato ha valori diversi'),preference),el('p',{class:'field-hint'},'La preferenza riguarda solo i dati diversi. Se lo stesso viaggio è presente con dati diversi, viene usata la versione scelta senza duplicarlo. Gli altri dati di entrambi i dispositivi restano conservati.'));
   const confirm=button('Collega e unisci','primary',async()=>{
    confirm.disabled=true;input.disabled=true;submit.disabled=true;error.textContent='';
    try{
     const record=await store.redeemDeviceLink(selectedCode,{prefer:preference.value,preview:result});
     state=D.validateState(record.state);user=record.user;dialog.close();render();
     toast(record.pending?'Dispositivi collegati. Unione conservata sul telefono: completa la sincronizzazione quando torni online.':'Dispositivi collegati: archivio condiviso aggiornato.',Boolean(record.pending));
    }catch(err){error.textContent=err.message;confirm.disabled=false;input.disabled=false;submit.disabled=false;}
   },'check',{class:'primary-button full',style:'margin-top:17px'});
   preview.append(confirm);
  }catch(err){error.textContent=err.message;}finally{submit.disabled=false;}
 });
 body.append(error,create,generated,el('div',{class:'profile-separator'}),form,preview,el('p',{class:'field-hint',style:'margin-top:20px'},'Le modifiche si aggiornano mentre l’app è aperta e connessa. Offline il telefono conserva i dati e li invia alla riconnessione.'));
}
function conflictComparison(copies,path){
 const read=(object,keys)=>keys.reduce((value,key)=>value&&Object.hasOwn(value,key)?value[key]:undefined,object);
 let label='Dato dell’archivio',local,remote,money=false;
 if(path.startsWith('profile.')){const key=path.slice(8);label=key==='firstName'?'Nome autista':'Cognome autista';local=copies.local.profile[key];remote=copies.remote.profile[key];}
 else if(path.startsWith('extraRates.')){const key=path.slice(11);label=D.SERVICES.find(service=>service.key===key)?.label||'Tariffa extra';local=copies.local.extraRates[key];remote=copies.remote.extraRates[key];money=true;}
 else for(const collection of ['customers','tariffs','trips']){
  const rows=[...copies.local[collection],...copies.remote[collection]];const row=rows.find(row=>path===`${collection}[${row.id}]`||path.startsWith(`${collection}[${row.id}].`));if(!row)continue;
  const prefix=`${collection}[${row.id}]`;const keys=path.slice(prefix.length).replace(/^\./,'').split('.').filter(Boolean);
  const localRow=copies.local[collection].find(value=>value.id===row.id),remoteRow=copies.remote[collection].find(value=>value.id===row.id);
  local=keys.length?read(localRow,keys):localRow;remote=keys.length?read(remoteRow,keys):remoteRow;money=keys.at(-1)==='cents'||keys.at(-1)?.endsWith('Cents')||keys[0]==='extraCents';
  label=collection==='customers'?`Cliente ${row.name}`:collection==='tariffs'?`Tariffa ${row.client} · ${row.city}`:`Viaggio ${formatDate(row.date)} · ${row.container}`;
  const labels={name:'Nome',city:'Località',address:'Indirizzo',vat:'Partita IVA',client:'Cliente',container:'Container',date:'Data',note:'Nota del viaggio',services:'Servizi',cents:'Importo',fareCents:'Trasferta',secondFareCents:'Seconda presa'};
  if(keys.length)label+=` · ${labels[keys.at(-1)]||D.SERVICES.find(service=>service.key===keys.at(-1))?.label||'Dettaglio'}`;break;
 }
 const display=value=>value===undefined?'Eliminato':value===null||value===''?'Non impostato':money&&typeof value==='number'?D.formatMoney(value):Array.isArray(value)?value.map(key=>D.SERVICES.find(service=>service.key===key)?.label||key).join(', '):typeof value==='object'?`${value.container||value.name||value.client||'Dato presente'}${value.city?' · '+value.city:''}`:String(value);
 return el('div',{class:'device-conflict-value'},el('strong',{},label),el('span',{},'Questo dispositivo: ',el('b',{},display(local))),el('span',{},'Online: ',el('b',{},display(remote))));
}
async function syncConflictDialog(){
 const {dialog,body}=modal('Risolvi sincronizzazione',{subtitle:'Lo stesso dato è stato modificato su due dispositivi. Controlla le copie e scegli quali valori usare solo per le differenze.'});
 const error=el('div',{class:'form-error',role:'alert'});body.append(error);
 try{
  const copies=await store.inspectSyncConflict();
  body.append(el('p',{class:'section-label'},'Copia su questo dispositivo'),archiveSummary(copies.local),el('p',{class:'section-label',style:'margin-top:18px'},'Copia online'),archiveSummary(copies.remote));
  const fields=new Set((copies.paths||[]).map(path=>path.startsWith('profile')?'Profilo autista':path.startsWith('extraRates')?'Tariffe extra':path.startsWith('customers')?'Clienti':path.startsWith('tariffs')?'Tariffe':path.startsWith('trips')?'Viaggi':'Archivio'));
  if(fields.size)body.append(el('p',{class:'profile-description',style:'margin-top:16px'},`Dati da controllare: ${[...fields].join(', ')}.`));
  body.append(el('div',{class:'device-conflict-list'},(copies.paths||[]).slice(0,20).map(path=>conflictComparison(copies,path))));
  if((copies.paths||[]).length>20)body.append(el('p',{class:'field-hint'},`Sono presenti altre ${copies.paths.length-20} differenze. Esporta il backup prima di scegliere la versione da usare.`));
  body.append(button('Esporta copia di questo dispositivo','secondary',downloadBackup,'download',{class:'secondary-button full',style:'margin-top:18px'}));
  const select=el('select',{'aria-label':'Valori da usare per le differenze'},el('option',{value:'remote'},'Usa i valori online'),el('option',{value:'local'},'Usa i valori di questo dispositivo'));
  body.append(el('label',{class:'field',style:'margin-top:18px'},el('span',{class:'field-label'},'Per i dati modificati da entrambi'),select),el('p',{class:'field-hint'},'Le modifiche senza conflitto si uniscono. Prima di confermare puoi esportare una copia di sicurezza.'));
  const confirm=button('Conferma e sincronizza','primary',async()=>{confirm.disabled=true;error.textContent='';try{const record=await store.resolveSyncConflict(select.value,copies.revision);state=D.validateState(record.state);user=record.user;dialog.close();render();toast('Modifiche unite e sincronizzate.');}catch(err){error.textContent=err.message;confirm.disabled=false;}},'check',{class:'primary-button full',style:'margin-top:18px'});
  body.append(confirm);
 }catch(err){error.textContent=err.message;}
}
function menuButton(title,description,ico,handler){return el('button',{type:'button',class:'menu-button',on:{click:handler}},icon(ico),el('span',{},title,el('small',{},description)),el('span',{class:'menu-arrow'},'›'));}
function downloadBlob(blob,fileName){const url=URL.createObjectURL(blob);const anchor=el('a',{href:url,download:fileName});document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function downloadBackup(){
 try{
  const text=D.exportBackup(state);const fileName=`LTS-Backup-${today()}.json`;const blob=new Blob([text],{type:'application/json'});const file=new File([blob],fileName,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Backup LTS Registro Viaggi'});}else downloadBlob(blob,fileName);
  toast('Backup pronto. Conservalo in una cartella sicura.');
 }catch(err){if(err.name!=='AbortError')toast(err.message||'Impossibile esportare il backup.',true);}
}
function downloadAndroidBackup(){
 const {dialog,body}=modal('Esporta per Android',{subtitle:'Trasferisce profilo, viaggi, clienti e tariffe nell’app Android tramite un file ZIP.'});
 const reminders=el('input',{type:'checkbox',name:'androidReminders'});const error=el('div',{class:'form-error',role:'alert'});
 body.append(el('label',{class:'export-reminders'},reminders,el('span',{},'Attiva i promemoria su Android',el('small',{},'14:00, 18:00 e fine mese. La scelta verrà applicata quando ripristini lo ZIP su Android.'))),error);
 const confirm=button('Esporta ZIP','primary',async()=>{confirm.disabled=true;error.textContent='';try{await exportAndroidFile(reminders.checked);dialog.close();}catch(err){if(err.name!=='AbortError')error.textContent=err.message||'Impossibile esportare il backup Android.';confirm.disabled=false;}});
 body.append(el('div',{class:'dialog-actions'},button('Annulla','secondary',()=>dialog.close()),confirm));
}
async function exportAndroidFile(remindersEnabled){
 try{
  if(!state.profile.firstName||!state.profile.lastName)throw new Error('Completa prima nome e cognome nel profilo.');
  const {exportAndroidBackup}=await import('/LTS-Registro-Viaggi/shared/android-backup-export.mjs');const bytes=await exportAndroidBackup(state,{remindersEnabled});const fileName=`LTS-Backup-Android-${today()}.zip`;const blob=new Blob([bytes],{type:'application/zip'});const file=new File([blob],fileName,{type:'application/zip'});
  if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({files:[file],title:'Backup LTS per Android'});else downloadBlob(blob,fileName);
  toast('ZIP pronto: importalo dal profilo dell’app Android.');
 }catch(err){throw err;}
}
async function importFile(file){
 try{
  if(file.size>32*1024*1024)throw new Error('Il backup supera il limite di 32 MB.');
  let imported;
  if(/\.zip$/i.test(file.name)||file.type==='application/zip'){const module=await import('/LTS-Registro-Viaggi/shared/android-backup.mjs');imported=await module.readAndroidBackup(file);}else imported=D.importBackup(await file.text());
  imported=D.validateState(imported);
  if(!store.usingAccount()||!accountAccess.isVerified())
    throw new Error('Accedi con le tue credenziali prima di importare un backup.');
  const previous=D.validateState(state);
  const originalFingerprint=JSON.stringify(previous);
  let preview;
  try{preview=unionStates(previous,imported,{prefer:null});}
  catch{
    throw new Error('Il backup contiene dati in conflitto con il tuo registro. Nessun dato è stato modificato. Conserva entrambi i backup: serve una risoluzione guidata, non una sostituzione.');
  }
  const summary=data=>`${data.trips.length} viaggi, ${data.customers.length} clienti, ${data.tariffs.length} tariffe`;
  const {dialog,body}=modal('Unisci backup senza perdere dati',{subtitle:'I dati del file vengono aggiunti al tuo account. I dati già presenti non saranno sostituiti e il file originale resterà intatto.'});
  body.append(el('p',{class:'field-hint'},'Registro attuale: '+summary(previous)),
    el('p',{class:'field-hint'},'Backup scelto: '+summary(imported)),
    el('p',{class:'field-hint'},'Dopo l’unione: '+summary(preview)));
  const error=el('p',{class:'form-error',role:'alert'});
  const acknowledge=el('input',{type:'checkbox','aria-label':'Ho verificato e conservato il backup attuale'});
  const confirm=button('Unisci i due registri','primary',async()=>{
    if(!acknowledge.checked||!backupStarted){error.textContent='Prima scarica e conserva il backup del registro attuale.';return;}
    if(!window.confirm('Confermi che il backup appartiene al tuo account? I dati attuali verranno mantenuti.'))return;
    confirm.disabled=true;error.textContent='';
    try{
      await accountAccess.verifySession();
      if(JSON.stringify(D.validateState(state))!==originalFingerprint)
        throw new Error('Il registro è cambiato durante l’anteprima. Riapri Importa backup per evitare di perdere modifiche.');
      const combined=unionStates(D.validateState(state),imported,{prefer:null});
      await persist(combined);
      draft=newDraft();editingId=null;editingBaseline=null;
      month=state.trips.length?D.sortTrips(state.trips)[0].date.slice(0,7):today().slice(0,7);
      dialog.close();navigate('register');
      toast('Backup unito. Verifica viaggi, clienti e tariffe dopo la sincronizzazione.');
      if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
    }catch(e){error.textContent=e.message||'Unione non riuscita: i dati precedenti sono conservati.';confirm.disabled=false;}
  });
  let backupStarted=false;
  confirm.disabled=true;
  const backupButton=button('1. Scarica backup del registro attuale','secondary',()=>{
    try{
      downloadBlob(new Blob([D.exportBackup(previous)],{type:'application/json'}),`LTS-Backup-Prima-Unione-${today()}.json`);
      backupStarted=true;
      confirm.disabled=!acknowledge.checked;
      error.textContent='Controlla che il backup sia stato salvato sul telefono prima di procedere.';
    }catch(e){error.textContent=e.message||'Impossibile esportare il registro attuale.';}
  },'download');
  acknowledge.addEventListener('change',()=>{confirm.disabled=!(acknowledge.checked&&backupStarted);});
  body.append(error,backupButton,
    el('label',{class:'export-reminders'},acknowledge,
      el('span',{},'Ho controllato che il backup del registro attuale sia salvato e conservo anche il file da importare.')),
    confirm,
    button('Annulla','text',()=>dialog.close()));
 }catch(err){toast(err.message||'Il backup non può essere letto.',true);}
}
async function startInstall(){
 if(isInstalled()){toast('LTS è già aperta come app.');return;}
 if(installPrompt){
  const prompt=installPrompt;installPrompt=null;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')return;}catch{}
 }
 installDialog();
}
function installDialog(){
 if(document.querySelector('[data-install-dialog]'))return;
 const apple=isAppleMobile();
 const {dialog,body}=modal('Installa LTS',{subtitle:apple?'Aggiungi il registro alla schermata Home del tuo iPhone.':'Tieni il tuo registro a portata di mano, sulla schermata Home.'});dialog.dataset.installDialog='';
 body.prepend(el('img',{class:'install-app-icon',src:'/LTS-Registro-Viaggi/assets/apple-touch-icon.png',alt:'LTS Registro Viaggi',width:76,height:76}));
 const steps=el('ol',{class:'install-guide'});
 if(apple){
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri questa pagina in Safari'),el('p',{},'Se stai usando il browser interno di un’altra app, copia il link qui sotto e aprilo direttamente in Safari.'))),el('li',{},el('div',{},el('strong',{},icon('share'),'Tocca Condividi'),el('p',{},'Cerca il quadrato con la freccia verso l’alto. Può essere nel menu di Safari.'))),el('li',{},el('div',{},el('strong',{},'Aggiungi alla schermata Home'),el('p',{},'Se compare “Apri come app web”, attivalo. Poi premi “Aggiungi”.'))));
  body.append(steps,el('div',{class:'info-note'},icon('info'),'La conferma finale si fa nel menu di Safari. Se manca la voce, scorri fino a “Modifica azioni”.'));
 }else{
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri il menu del browser'),el('p',{},'Su telefono cerca il pulsante ⋮ o il menu Condividi.'))),el('li',{},el('div',{},el('strong',{},'Scegli “Installa app”'),el('p',{},'Può chiamarsi anche “Aggiungi alla schermata Home”. Su iPhone usa Condividi in Safari.'))),el('li',{},el('div',{},el('strong',{},'Conferma l’aggiunta'),el('p',{},'Apri LTS dalla nuova icona sul telefono.'))));body.append(steps);
 }
 const manifest=document.querySelector('link[rel="manifest"]');const url=new URL('./',manifest?.href||location.href).href;
 const link=el('input',{type:'url',value:url,readonly:true,'aria-label':'Link dell’app LTS',class:'install-url'});
 const copy=button('Copia link','secondary',async()=>{try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(url);copy.textContent='Link copiato';}catch{link.focus();link.select();toast('Tieni premuto sul link e scegli Copia.');}},'link');
 body.append(el('div',{class:'install-link'},link,copy),button('Torna al registro','text',()=>dialog.close(),null,{class:'text-button full'}));
}
/**
 * Login is opt-in for existing device archives. Logging into Supabase never
 * copies or reassigns their records. Users can explicitly export/import a ZIP.
 */
function accountLoginFields({fromGate=false,initialPhone=''}={}){
  const form=el('form',{class:`panel form-panel account-login-form${fromGate?' account-login-form-gate':''}`,novalidate:true});
  const error=el('p',{class:'form-error',role:'alert','aria-live':'assertive'});
  const prefix=fromGate?'accesso-gate':'accesso-dialogo';
  const tel=el('input',{id:prefix+'-telefono',type:'tel',name:'phone',inputmode:'tel',autocomplete:'username',
    placeholder:'+39 3XX XXX XXXX',required:true,maxlength:40,value:initialPhone,'aria-label':'Numero di cellulare'});
  const pass=el('input',{id:prefix+'-password',type:'password',name:'password',autocomplete:'current-password',
    placeholder:'Inserisci la password',required:true,maxlength:256,'aria-label':'Password'});
  const visibility=el('button',{type:'button',class:'account-password-toggle',
    'aria-label':'Mostra password','aria-controls':pass.id,'aria-pressed':'false'},'Mostra');
  visibility.addEventListener('click',()=>{
    const showing=pass.type==='password';
    pass.type=showing?'text':'password';
    visibility.textContent=showing?'Nascondi':'Mostra';
    visibility.setAttribute('aria-label',showing?'Nascondi password':'Mostra password');
    visibility.setAttribute('aria-pressed',String(showing));
    pass.focus({preventScroll:true});
  });
  const submit=el('button',{type:'submit',class:'primary-button full account-submit'},icon('lock'),'Accedi al registro',icon('arrow'));
  const number=el('div',{class:'field'},
    el('label',{class:'field-label',for:tel.id},'Numero di cellulare'),
    el('div',{class:'account-input-wrap'},el('span',{class:'account-input-icon'},icon('phone')),tel),
    el('p',{class:'field-hint'},'Per i numeri italiani puoi scrivere 3XXXXXXXXX: +39 viene aggiunto automaticamente.'));
  const password=el('div',{class:'field'},
    el('label',{class:'field-label',for:pass.id},'Password'),
    el('div',{class:'account-input-wrap account-password-wrap'},el('span',{class:'account-input-icon'},icon('lock')),pass,visibility));
  const note=el('div',{class:'account-security-note'},icon('info'),
    el('p',{},'L’account deve essere attivato dall’amministratore. Non inviare la password tramite chat.'));
  const activate=button('Attiva account','text',showDriverActivation,'users',
    {class:'text-button account-help-link'});
  const recover=button('Recupera password','text',()=>{
   if(!fromGate)form.closest('dialog')?.close();
   showDriverPasswordRecovery(tel.value);
  },'lock',{class:'text-button account-help-link account-recovery-link'});
  form.append(error,number,password,submit,note,
    el('div',{class:'account-help-actions'},activate,recover));
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(busy)return;
    error.textContent='';busy=true;submit.disabled=true;
    try{
      if(!fromGate&&(store.getSyncInfo().pending||store.getSyncInfo().conflict))
        throw new Error('Sincronizza prima le modifiche dell’archivio dispositivo oppure esporta un backup.');
      let phone=tel.value.trim();
      if(/^3\\d{9}$/.test(phone))phone='+39'+phone;
      const logged=await accountAccess.login(phone,pass.value);
      pass.value='';
      if(logged.role==='admin'&&logged.mfa_enrolled&&!logged.mfa_verified){
        window.location.assign(new URL('amministratore/',import.meta.url).href);
        return;
      }
      if(logged.role==='driver'&&!logged.remembered)
        toast('Accesso riuscito. Questo browser non consente di ricordare la sessione.',true);
      document.querySelectorAll('dialog[open]').forEach(node=>node.close());
      busy=false;submit.disabled=false;
      await initialize();
      return;
    }catch(err){
      error.textContent=err.message||'Impossibile accedere. Riprova.';
      pass.value='';
    }finally{busy=false;submit.disabled=false;}
  });
  return form;
}
function showAccountLogin(initialPhone=''){
  if(!accountAccess.isEnabled())return;
  const {body}=modal('Accesso autisti',{
    subtitle:'Apri soltanto i viaggi del tuo account. L’archivio dispositivo precedente non viene cancellato né importato automaticamente.'});
  body.append(accountLoginFields({initialPhone}),el('p',{class:'field-hint'},
    'Se devi recuperare viaggi precedenti, esportali prima dall’archivio dispositivo. Dopo il login usa Importa backup e conferma.'));
}

/** Recovery for drivers uses the existing admin-issued one-time reset code.
 * The original account UID and all personal trips remain unchanged. */
function showDriverPasswordRecovery(initialPhone=''){
 const {dialog,body}=modal('Recupera password autista',{
  subtitle:'Chiedi all’amministratore LTS un codice di ripristino, poi inseriscilo per scegliere una nuova password.'});
 const form=el('form',{class:'panel form-panel account-driver-recovery-form',novalidate:true});
 const error=el('p',{class:'form-error',role:'alert','aria-live':'assertive'});
 const phone=el('input',{id:'recover-phone',type:'tel',inputmode:'tel',autocomplete:'username',
  placeholder:'3XXXXXXXXX',value:initialPhone,maxlength:40,required:true});
 const code=el('input',{id:'recover-code',type:'text',autocomplete:'off',autocapitalize:'none',
  spellcheck:false,maxlength:43,required:true,placeholder:'Codice privato di 43 caratteri'});
 const pass=el('input',{id:'recover-password',type:'password',autocomplete:'new-password',
  minlength:12,maxlength:128,required:true,placeholder:'Nuova password'});
 const confirm=el('input',{id:'recover-confirm',type:'password',autocomplete:'new-password',
  minlength:12,maxlength:128,required:true,placeholder:'Ripeti nuova password'});
 const field=(label,input)=>el('div',{class:'field account-recovery-field'},
  el('label',{class:'field-label',for:input.id},label),input);
 const submit=el('button',{type:'submit',class:'primary-button full'},icon('lock'),'Reimposta password');
 const help=el('div',{class:'info-note account-driver-recovery-help'},icon('info'),
  el('span',{},'L’amministratore usa Autisti → Ripristina password. Il codice è monouso e dura 24 ore; non arriva automaticamente via SMS.'));
 form.append(error,field('Numero di cellulare',phone),field('Codice di ripristino',code),
  field('Nuova password (almeno 12 caratteri)',pass),field('Conferma password',confirm),submit,help);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled)return;
  error.textContent='';
  const number=phone.value.trim(),secret=code.value.trim(),newPass=pass.value;
  if(!(/^3\d{9}$/.test(number)||/^\+[1-9]\d{7,14}$/.test(number))){
   error.textContent='Inserisci il numero di cellulare, con +39 se necessario.';phone.focus();return;
  }
  if(!/^[A-Za-z0-9_-]{43}$/.test(secret)){
   error.textContent='Copia interamente il codice di ripristino di 43 caratteri.';code.focus();return;
  }
  if(newPass.length<12||newPass.length>128||newPass.trim()!==newPass||
    /[\u0000-\u001f\u007f]/.test(newPass)||!/[A-Za-z]/.test(newPass)||!/\d/.test(newPass)){
   error.textContent='Scegli 12–128 caratteri, con lettere e numeri, senza spazi iniziali o finali.';pass.focus();return;
  }
  if(newPass!==confirm.value){
   error.textContent='Le password non coincidono.';confirm.focus();return;
  }
  submit.disabled=true;
  try{
   const result=await accountAccess.recoverDriverPassword({phone:number,code:secret,password:newPass});
   if(result?.ok!==true)throw new Error('Ripristino non confermato. Richiedi assistenza.');
   const signInPhone=/^3\d{9}$/.test(number)?'+39'+number:number;
   form.replaceChildren(
    el('section',{class:'account-driver-recovery-success',role:'status','aria-live':'polite'},
     el('span',{class:'account-driver-recovery-check','aria-hidden':'true'},icon('check')),
     el('h3',{},'Password aggiornata'),
     el('p',{},'Ora puoi accedere con la nuova password. Il tuo account e i viaggi già registrati restano conservati.')),
    button('Torna all’accesso','primary',()=>{
      dialog.close();
      const gate=root.querySelector('#accesso-gate-telefono');
      if(gate){gate.value=signInPhone;gate.focus({preventScroll:true});}
      else showAccountLogin(signInPhone);
    },'log-in',{class:'primary-button full'}));
  }catch(err){
   error.textContent=err?.message||'Ripristino non riuscito. Controlla il codice o chiedine uno nuovo.';
  }finally{
   pass.value='';confirm.value='';submit.disabled=false;
  }
 });
 body.append(form);phone.focus({preventScroll:true});
}

/** Success is announced only after the onboarding endpoint confirms redemption. */
function showActivationOpening(){
 const overlay=el('div',{class:'activation-feedback-layer',role:'status','aria-live':'polite'},
   el('section',{class:'activation-feedback-card','aria-label':'Conferma attivazione account'},
     el('span',{class:'activation-feedback-check','aria-hidden':'true'},icon('check')),
     el('p',{class:'activation-feedback-eyebrow'},'ACCESSO AUTISTI LTS'),
     el('h2',{},'Account attivato!'),
     el('p',{class:'activation-feedback-message'},'Attivazione confermata. Sto aprendo il tuo Registro Viaggi in sicurezza…'),
     el('span',{class:'activation-feedback-progress','aria-hidden':'true'})));
 document.body.append(overlay);
 return {
  close:()=>overlay.remove(),
  manualAccess:()=>{
   overlay.setAttribute('role','alert');
   const card=overlay.querySelector('.activation-feedback-card');
   card.querySelector('.activation-feedback-progress')?.remove();
   card.querySelector('.activation-feedback-message').textContent=
     'Account attivato correttamente. Non è stato possibile aprire automaticamente il registro. Accedi con il tuo numero e la password appena scelta.';
   card.append(button('Accedi al Registro Viaggi','primary',()=>{
     overlay.remove();renderAccountGate();
     root.querySelector('input[name="phone"]')?.focus();
   },'arrow',{class:'primary-button full activation-feedback-action'}));
  }
 };
}
function showDriverActivation(){
 const {dialog,body}=modal('Attiva o ripristina il tuo account',{
   subtitle:'Per la prima attivazione o il reinserimento dello stesso autista, usa il codice ricevuto privatamente dall’amministratore. Il codice dura 24 ore e si usa una sola volta.'});
 const form=el('form',{class:'panel form-panel',novalidate:true});
 const error=el('p',{class:'form-error',role:'alert'});
 const phone=el('input',{type:'tel',autocomplete:'tel',inputmode:'tel',placeholder:'3XXXXXXXXX',maxlength:40,required:true,'aria-label':'Numero di cellulare'});
 const code=el('input',{type:'text',autocomplete:'off',autocapitalize:'none',spellcheck:false,maxlength:80,required:true,'aria-label':'Codice invito'});
 const password=el('input',{type:'password',autocomplete:'new-password',minlength:12,maxlength:128,required:true,'aria-label':'Crea password'});
 const confirm=el('input',{type:'password',autocomplete:'new-password',minlength:12,maxlength:128,required:true,'aria-label':'Ripeti password'});
 const submit=el('button',{type:'submit',class:'primary-button full'},'Attiva account');
 const fieldNode=(label,node)=>el('div',{class:'field'},el('label',{class:'field-label'},label),node);
 const existingNote=el('div',{class:'info-note account-activation-existing'},icon('info'),
   el('span',{},'Stesso autista già registrato? Non serve creare un altro account. Se devi ripristinare la password, usa lo stesso numero e il codice di reinserimento fornito dall’amministratore. I tuoi viaggi restano collegati all’account originale.'));
 form.append(existingNote,error,fieldNode('Numero di telefono (+39 automatico)',phone),
   fieldNode('Codice invito monouso',code),fieldNode('Scegli la password (almeno 12 caratteri, lettere e numeri)',password),
   fieldNode('Conferma password',confirm),submit,
   el('p',{class:'field-hint'},'La password viene inviata via HTTPS a Supabase Auth. Non è visibile all’amministratore e non viene memorizzata nel registro. Il codice invito non costituisce una verifica SMS.'));
 form.addEventListener('submit',async e=>{
   e.preventDefault();error.textContent='';
   if(password.value!==confirm.value){error.textContent='Le password non coincidono.';return;}
   if(password.value.length<12||!/[A-Za-z]/.test(password.value)||!/\d/.test(password.value)){
     error.textContent='Usa almeno 12 caratteri, con lettere e numeri.';return;
   }
   submit.disabled=true;
   try{
     const activationPhone=phone.value.trim();
     const currentPassword=password.value; // In-memory only; never saved or logged.
     await accountAccess.activateDriverInvitation({
       phone:activationPhone,code:code.value.trim(),password:currentPassword
     });
     password.value='';confirm.value='';code.value='';
     dialog.close();
     const feedback=showActivationOpening();
     try{
       // An invitation redemption is not itself an authenticated session.
       const signInPhone=/^3\d{9}$/.test(activationPhone)?'+39'+activationPhone:activationPhone;
       const logged=await accountAccess.login(signInPhone,currentPassword);
       if(logged.role!=='driver'||!accountAccess.isVerified()){
         accountAccess.signOut();
         throw new Error('Identità autista non verificata.');
       }
       tab='register';month=today().slice(0,7);
       activationFirstOpen=true;activationWelcome=true;
       await initialize();
       activationFirstOpen=false;
       if(!accountAccess.isVerified()||!store.usingAccount()||!root.querySelector('.app-frame'))
         throw new Error('Registro personale non disponibile.');
       feedback.close();
       if(!logged.remembered)
         toast('Registro aperto. Il browser potrebbe richiedere un nuovo accesso dopo la chiusura.',true);
     }catch(openError){
       // The account is active, but no register is claimed open after failure.
       activationFirstOpen=false;activationWelcome=false;
       feedback.manualAccess();
     }
   }catch(err){
     // New and already-registered drivers must both reject breached passwords.
     // Server checks a breach before claiming the one-time invitation/reset code.
     const message=err?.message||'Operazione non riuscita. Chiedi aiuto all’amministratore.';
     error.textContent=/Password già presente in violazioni note/i.test(message)
       ?'Questa password risulta compromessa. Anche se sei lo stesso autista, scegline una nuova. Il codice non è stato utilizzato e i viaggi sono conservati.'
       :message;
   }
   finally{password.value='';confirm.value='';submit.disabled=false;}
 });
 body.append(form,el('div',{class:'account-activation-help'},
   el('p',{class:'field-hint'},'Se ricordi la password del tuo account già attivo, accedi direttamente. Per ripristinarla chiedi un codice all’amministratore.'),
   button('Torna all’accesso','text',()=>{dialog.close();showAccountLogin();},'log-in')));
 phone.focus();
}
function showDriverAdmin(){
 if(!store.usingAccount()||accountAccess.getRole()!=='admin'||!accountAccess.isVerified()){
   toast('Accedi prima come amministratore.',true);return;
 }
 const {dialog,body}=modal('Gestisci autisti',{
   subtitle:'Puoi rimuovere anche gli autisti già attivati. L’accesso viene bloccato, ma lo stesso numero, account e tutti i viaggi restano recuperabili dal reinserimento.'});
 const form=el('form',{class:'panel form-panel',novalidate:true});
 const error=el('p',{class:'form-error',role:'alert'});
 const first=el('input',{type:'text',autocomplete:'off',maxlength:80,required:true,'aria-label':'Nome'});
 const last=el('input',{type:'text',autocomplete:'off',maxlength:80,required:true,'aria-label':'Cognome'});
 const phone=el('input',{type:'tel',autocomplete:'off',inputmode:'tel',maxlength:40,required:true,placeholder:'3XXXXXXXXX','aria-label':'Cellulare autista'});
 const submit=el('button',{type:'submit',class:'primary-button full'},'Genera invito');
 const fieldNode=(label,node)=>el('div',{class:'field'},el('label',{class:'field-label'},label),node);
 form.append(error,fieldNode('Nome autista',first),fieldNode('Cognome autista',last),
   fieldNode('Telefono (+39 automatico)',phone),submit);
 form.append(button('Reinserisci account rimosso','secondary',async()=>{
   error.textContent='';result.hidden=true;
   if(!first.value.trim()||!last.value.trim()||!phone.value.trim()){
     error.textContent='Inserisci nome, cognome e lo stesso numero di telefono dell’account rimosso.';return;
   }
   if(!window.confirm('Reinserire l’account già attivato per '+phone.value.trim()+'? L’accesso con la password precedente sarà riabilitato e tutti i viaggi resteranno collegati allo stesso account.'))return;
   try{
     const restored=await accountAccess.manageDrivers('reinsert-activated',{
       phone:phone.value.trim(),firstName:first.value.trim(),lastName:last.value.trim()});
     result.replaceChildren(el('strong',{},'Autista reinserito: '+restored.phone),
       el('p',{class:'field-hint'},'Lo stesso account e i viaggi sono stati conservati. L’autista può accedere con la password precedente.'));
     result.hidden=false;first.value='';last.value='';phone.value='';await updateList();
   }catch(err){error.textContent=err.message||'Reinserimento non riuscito.';}
 }));
 const result=el('div',{class:'panel',hidden:true});
 const roster=el('div',{class:'driver-management-list'});
 const listError=el('p',{class:'form-error',role:'alert'});
 async function updateList(){
   listError.textContent='';roster.replaceChildren(el('p',{class:'field-hint'},'Caricamento autisti…'));
   try{
     const info=await accountAccess.manageDrivers('list');
     const entries=Array.isArray(info?.drivers)?info.drivers:[];
     const labels={active:'Attivo',disabled:'Disattivato',invited:'Invito in attesa',pending:'Da invitare',
       expired:'Invito scaduto',processing:'Attivazione in corso',revoked:'Invito annullato',completed:'Attivato',
       resetting:'Ripristino credenziali in attesa'};
     roster.replaceChildren();
     if(!entries.length)roster.append(el('p',{class:'field-hint'},'Nessun autista ancora inserito.'));
     for(const entry of entries){
       const item=el('div',{class:'panel'},
         el('strong',{},[entry.firstName,entry.lastName].filter(Boolean).join(' ')||'Autista'),
         el('p',{class:'field-hint'},entry.phone+' · '+(labels[entry.status]||'Da verificare')));
       if(['active','disabled'].includes(entry.status)){
         const enabled=entry.status==='disabled';
         item.append(button(enabled?'Riattiva':'Disattiva','secondary',async()=>{
           if(!window.confirm((enabled?'Riattivare':'Disattivare')+' il login di '+entry.phone+'?'))return;
           try{await accountAccess.manageDrivers('set-access',{phone:entry.phone,enabled});toast('Accesso aggiornato.');await updateList();}
           catch(err){listError.textContent=err.message;}
         }));
         // Credential recovery preserves the original Supabase user_id,
         // personal archive and Android backup, unlike deleting the Auth user.
         item.append(button('Reinserisci credenziali','secondary',async()=>{
           if(!window.confirm('Reinserire le credenziali di '+entry.phone+'? Il vecchio accesso sarà sospeso subito. L’autista userà un nuovo codice e sceglierà una nuova password. Il suo account e tutti i viaggi resteranno conservati. Continuare?'))return;
           try{
             const issued=await accountAccess.manageDrivers('issue-reset',{phone:entry.phone});
             const code=el('input',{type:'text',readonly:true,value:issued.code,
               autocomplete:'off',spellcheck:false,'aria-label':'Codice privato di ripristino'});
             result.replaceChildren(
               el('strong',{},'Nuovo codice per reinserire '+entry.phone),
               el('p',{class:'field-hint'},'Accesso sospeso. Nessun viaggio eliminato. Consegna questo codice privatamente: scade fra 24 ore.'),
               code,button('Copia codice','secondary',async()=>{
                 try{await navigator.clipboard.writeText(issued.code);toast('Codice copiato.');}
                 catch{code.focus();code.select();toast('Seleziona e copia il codice.');}
               }),
               el('p',{class:'field-hint'},'L’autista apre LTS → Recupera password, inserisce lo stesso numero, il nuovo codice e una password nuova. Il registro esistente resta collegato.'));
             result.hidden=false;
             await updateList();
             result.scrollIntoView({behavior:'smooth',block:'center'});
           }catch(err){listError.textContent=err.message||'Impossibile avviare il ripristino.';}
         }));
       }else if(entry.status==='resetting'){
         item.append(el('p',{class:'field-hint'},'Codice di reinserimento già emesso. Se è stato smarrito, annullalo e genera un nuovo codice. L’account resta sospeso fino al completamento.'));
         item.append(button('Annulla ripristino','secondary',async()=>{
           if(!window.confirm('Annullare il ripristino per '+entry.phone+'? L’account resterà disattivato finché non lo riattivi.'))return;
           try{
             await accountAccess.manageDrivers('revoke-reset',{phone:entry.phone});
             toast('Codice annullato; account ancora disattivato.');
             await updateList();
           }catch(err){listError.textContent=err.message||'Impossibile annullare il ripristino.';}
         }));
       }else if(['invited','processing'].includes(entry.status)){
         item.append(button(entry.status==='processing'?'Annulla attivazione':'Annulla invito','secondary',async()=>{
           if(!window.confirm('Annullare il codice di attivazione per '+entry.phone+'? Un’attivazione in corso verrà interrotta.'))return;
           try{await accountAccess.manageDrivers('revoke-invite',{phone:entry.phone});await updateList();}
           catch(err){listError.textContent=err.message;}
         }));
       }else if(['pending','expired','revoked'].includes(entry.status)){
         item.append(button(entry.status==='pending'?'Genera invito':'Rigenera invito','secondary',()=>{
           if(submit.disabled)return;
           first.value=entry.firstName||'';
           last.value=entry.lastName||'';
           phone.value=entry.phone||'';
           if(!first.value.trim()||!last.value.trim()||!phone.value.trim()){
             listError.textContent='Completa i dati dell’autista nel modulo in alto.';
             form.scrollIntoView({block:'start'});
             return;
           }
           // The visible click runs the same verified admin action as the form.
           form.requestSubmit();
         }));
       }
       // A pending candidate is not an account: removing it only revokes
       // activation codes and hides the candidate. Future re-invites are safe.
       if(['pending','invited','processing','expired','revoked'].includes(entry.status)){
         item.append(button('Rimuovi autista','secondary',async()=>{
           if(!window.confirm('Rimuovere '+entry.phone+' dall’elenco degli autisti non attivati? I codici d’invito saranno annullati. Potrai reinserire lo stesso numero in seguito.'))return;
           try{
             await accountAccess.manageDrivers('remove-pending',{phone:entry.phone});
             toast('Autista rimosso. Puoi reinserire il numero.');
             await updateList();
           }catch(err){listError.textContent=err.message||'Impossibile rimuovere l’autista.';}
         }));
       }
       if(['active','disabled','resetting'].includes(entry.status)){
         item.append(button('Rimuovi autista','secondary',async()=>{
           if(!window.confirm('Rimuovere '+entry.phone+' dall’elenco? Il login sarà bloccato immediatamente. Account e viaggi NON saranno cancellati. Potrai reinserire lo stesso numero dal modulo in alto.'))return;
           try{
             await accountAccess.manageDrivers('remove-activated',{phone:entry.phone});
             toast('Autista rimosso: accesso bloccato, viaggi conservati.');
             await updateList();
           }catch(err){listError.textContent=err.message||'Impossibile rimuovere l’autista.';}
         }));
       }
       roster.append(item);
     }
   }catch(err){listError.textContent=err.message||'Impossibile leggere gli autisti.';}
 }
 form.addEventListener('submit',async e=>{
   e.preventDefault();error.textContent='';submit.disabled=true;result.hidden=true;result.replaceChildren();
   try{
     const issued=await accountAccess.manageDrivers('issue',{
       firstName:first.value.trim(),lastName:last.value.trim(),phone:phone.value.trim()});
     const code=el('input',{type:'text',readonly:true,value:issued.code,
       autocomplete:'off',spellcheck:false,'aria-label':'Codice invito privato'});
     result.append(el('strong',{},'Invito creato per '+issued.firstName+' '+issued.lastName),
       el('p',{class:'field-hint'},'Numero: '+issued.phone+'. Scade dopo 24 ore. Mostra questo codice solo alla persona autorizzata; non salvarlo nel registro.'),
       code,button('Copia codice','secondary',async()=>{
         try{await navigator.clipboard.writeText(issued.code);toast('Codice copiato. Consegnalo privatamente.');}
         catch{code.focus();code.select();toast('Seleziona e copia il codice.');}
       }),
       el('p',{class:'field-hint'},'Consegna il codice con un canale privato. L’autista apre LTS → Attiva account e sceglie la password. Nessun SMS viene inviato automaticamente.'));
     result.hidden=false;first.value='';last.value='';phone.value='';
     await updateList();
     result.scrollIntoView({behavior:'smooth',block:'center'});
   }catch(err){error.textContent=err.message||'Impossibile creare l’invito.';}
   finally{submit.disabled=false;}
 });
 body.append(form,result,el('h3',{},'Elenco autisti'),listError,roster,
   button('Aggiorna elenco','secondary',()=>updateList(),'refresh'));
 updateList();
}
async function showLegacyArchiveRecovery(preview=null) {
  if(!store.usingAccount()||!accountAccess.isVerified())return;
  try { preview=preview||await store.previewLegacyArchive(); }
  catch(err){toast(err.message||'Impossibile controllare i vecchi dati sul dispositivo.',true);return;}
  if(!preview){toast('Nessun archivio precedente trovato in questo browser. Per dati da un altro dispositivo usa Importa backup.');return;}
  const {dialog,body}=modal('Recupera i viaggi precedenti',{
    subtitle:'Questi dati erano salvati sul dispositivo prima dell’accesso con password. Importali solo se appartengono a te. Il vecchio archivio resta conservato.'});
  const details=el('div',{class:'panel'},
    el('strong',{},preview.name||'Vecchio registro senza nome'),
    el('p',{class:'field-hint'},preview.trips+' viaggi · '+preview.customers+' clienti · '+preview.tariffs+' tariffe'));
  const message=el('p',{class:'field-hint'},'Prima salva un backup. Il trasferimento non elimina la copia precedente e non sostituisce automaticamente eventuali dati dell’account.');
  const error=el('p',{class:'form-error',role:'alert'});
  let backupRequested=false;
  const restore=button('Unisci nel mio account','primary',async()=>{
    if(!backupRequested){error.textContent='Salva prima il backup del vecchio archivio.';return;}
    if(!window.confirm('Confermi che questo vecchio registro è tuo e vuoi unirlo al tuo account? La copia sul dispositivo resta intatta.'))return;
    restore.disabled=true;error.textContent='';
    try{
      const result=await store.importLegacyArchive();
      state=D.validateState(result.state);user=result.user||null;
      dialog.close();render();
      toast(result.pending?'Dati recuperati sul telefono. Sincronizza appena torna Internet.':'Dati precedenti recuperati nel tuo account.');
      if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
    }catch(e){error.textContent=e.message||'Importazione non riuscita. I dati precedenti sono conservati.';restore.disabled=false;}
  });
  restore.disabled=true;
  const backup=button('Scarica backup dei dati precedenti','secondary',async()=>{
    backup.disabled=true;error.textContent='';
    try{
      const data=await store.exportLegacyBackup();
      downloadBlob(new Blob([data],{type:'application/json'}),`LTS-Backup-Prima-Account-${today()}.json`);
      backupRequested=true;restore.disabled=false;
      toast('Backup scaricato: verifica di averlo conservato prima di procedere.');
    }catch(e){error.textContent=e.message||'Esportazione del vecchio archivio non riuscita.';}
    finally{backup.disabled=false;}
  },'download');
  const later=button('Non ora','text',()=>{
    dialog.close();
    if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
  });
  body.append(details,message,error,backup,restore,later);
}
/** Promotional installation card displayed only before login and outside standalone mode.
 * Uses the existing browser-native PWA installation flow, never changes authentication. */
function accountInstallBanner(){
 return el('aside',{class:'account-install-banner','data-install-trigger':true,
  hidden:isInstalled(),'aria-label':'Installa LTS sul telefono'},
  el('div',{class:'account-install-banner-main'},
   el('span',{class:'account-install-banner-mark','aria-hidden':'true'},icon('download')),
   el('div',{class:'account-install-banner-copy'},
    el('strong',{},'LTS sempre con te'),
    el('p',{},'Aggiungi l’app alla schermata Home del telefono.'))),
  button('Installa app','secondary',startInstall,'download',
   {class:'account-install-banner-action','aria-label':'Installa LTS sul dispositivo'}),
  el('span',{class:'account-install-banner-wave','aria-hidden':'true'}));
}
function renderAccountGate(message=''){
 realtimeBridge?.stop();realtimeBridge=null;
 companyCustomers=[];
 companyCustomersError='';
 companyCustomerSearch='';customerDirectoryScope='all';customerDirectoryLimit=24;companyCustomersLoaded=false;companyCustomersRequest++;
 companyRates=[];companyRatesLoaded=false;
 companyExtraRates=[];companyExtrasLoaded=false;companyRatesRequest++;
 const hasPreviousSession=accountAccess.hasSession();
 const recovery=hasPreviousSession?el('div',{class:'account-session-recovery'},
   el('p',{},'Questo dispositivo conserva una sessione precedente. Per rientrare nello stesso account, inserisci nuovamente la password. Per usare un altro account, esci prima.'),
   button('Esci e cambia account','secondary',()=>{
     // The offline/archive copy stays stored under its original owner.
     void accountAccess.logout().then(result=>{
       if(!result.revoked)toast('Sessione locale chiusa. La revoca online non è confermata.',true);
     });
     store.lockRevokedAccount();
     renderAccountGate('Sessione locale chiusa. Puoi accedere con un altro account.');
   },'log-out',{class:'secondary-button account-session-switch'})):null;
  // Never leave an authenticated profile, document or port iframe on screen.
  unmountPorti();state=D.emptyState();user=null;draft=newDraft();
  pdfReport=null;editingId=null;editingBaseline=null;busy=false;
  document.querySelectorAll('dialog[open]').forEach(node=>node.close());
  const gate=el('section',{class:'boot account-gate account-gate-premium'},
    el('div',{class:'account-hero'},
      el('div',{class:'account-hero-brand'},
        el('img',{src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS Registro Viaggi'}),
        el('span',{},'REGISTRO VIAGGI'),
        el('span',{class:'account-italian-accent','aria-hidden':'true'})),
      el('div',{class:'account-hero-heading'},
        el('p',{class:'account-hero-kicker'},'AREA AUTISTI'),
        el('h1',{},'Accedi al tuo registro'),
        el('p',{},'Il tuo registro viaggi, sempre a portata di mano.'))),
    el('div',{class:'account-login-stage'},
      message?el('p',{class:'form-error account-gate-error',role:'alert'},message):null,
      recovery,
      accountLoginFields({fromGate:true}),
      accountInstallBanner(),
      el('div',{class:'account-login-extras'},
        button('Riprova accesso automatico','secondary',()=>initialize(),'refresh',
          {class:'secondary-button account-retry-button'})),
      el('div',{class:'account-footnote'},icon('lock'),
        el('p',{},'I dati precedenti restano sul dispositivo. Dopo l’accesso potrai eseguire un backup e recuperarli nel tuo account.'))));
  root.replaceChildren(gate);
}
window.addEventListener('lts-account-locked',()=>{
  store.lockRevokedAccount();
  renderAccountGate('Sessione non più autorizzata. Accedi nuovamente.');
});
// A suspended driver's open tab must not keep showing an authenticated record
// after returning from background. Fail closed if online verification fails.
let resumingVerification=false;
document.addEventListener('visibilitychange',async()=>{
 if(document.hidden||resumingVerification||!store.usingAccount()||!accountAccess.hasSession())return;
 resumingVerification=true;
 try{await accountAccess.verifySession();void refreshCompanyCustomers();if(['insert','tariffs','customers'].includes(tab))void refreshCompanyRates();}
 catch{
   store.lockRevokedAccount();
   renderAccountGate('Impossibile verificare la sessione. Riprova con Internet attivo.');
 }finally{resumingVerification=false;}
});


/** Show the full Scania photograph during first boot. Keep the still truck visible,
 * with the progress bar moving, for a minimum interval after the app starts.
 * This is visual feedback only: account verification still gates all private data. */
/** Hold the full Scania photograph for at least 2.5 seconds on first boot.
 * The truck stays still and the CSS loading bar continues its animation.
 * Never turn this timer into an authentication shortcut: the archive must
 * finish verification first, and slow loads remain visible until ready. */
const MIN_INITIAL_SPLASH_MS=2500;
const initialSplashStartedAt=performance.now();
let initialLoaderClosed=false;
let initialLoaderWait=null;
async function finishInitialTruckLoading(){
 const loader=root.querySelector('.photo-splash');
 if(initialLoaderClosed||!loader)return true;
 if(!initialLoaderWait){
  const remaining=Math.max(0,MIN_INITIAL_SPLASH_MS-(performance.now()-initialSplashStartedAt));
  initialLoaderWait=remaining>0
   ?new Promise(resolve=>setTimeout(resolve,remaining))
   :Promise.resolve();
 }
 await initialLoaderWait;
 if(!loader.isConnected)return false;
 initialLoaderClosed=true;
 return true;
}
/** Every initial destination, including the login gate, respects the splash
 * duration. Later account lockouts stay immediate, because the splash is gone. */
async function renderFirstBootGate(message=''){
 if(root.querySelector('.photo-splash') && !(await finishInitialTruckLoading()))return;
 renderAccountGate(message);
}

async function initialize(){
 try{
  let result;
  if(accountAccess.accountGateRequired()){
    if(!accountAccess.hasSession()){
      try{await accountAccess.restoreDriverSession();}
      catch(error){
        await renderFirstBootGate(error.offline
          ?'Serve Internet per verificare la sessione salvata. Riprova quando torna la connessione.'
          :error.message||'Accesso automatico non riuscito.');
        return;
      }
      if(!accountAccess.hasSession()){
        await renderFirstBootGate();return;
      }
    }
    try{
      result=await store.activateAccountFromSession();
    }catch(error){
      // Never unlock an old local account archive without live verification.
      await renderFirstBootGate(error.offline
        ?'Per riaprire un archivio protetto dopo il riavvio serve Internet. I dati offline precedenti restano conservati.'
        :error.message||'Accesso account non verificato.');
      return;
    }
  }else result=await store.loadState();
  state=D.validateState(result?.state||result);user=result?.user||null;
  const subscribe=store.subscribeStatus||store.onStatus;if(subscribe)subscribe(setStatus);
  if(!subscribed&&store.subscribeState){store.subscribeState(receiveState);subscribed=true;}
  if(result?.status)setStatus(result.status);
  const notificationTab=location.hash.slice(1);if(['insert','register'].includes(notificationTab))tab=notificationTab;
  if(!(await finishInitialTruckLoading()))return;
  render();
  beginLtsRealtime();
  void refreshCompanyCustomers();
  void refreshCompanyRates();
  if(!activationFirstOpen && store.usingAccount() && !store.hasImportedLegacyArchive() &&
    state.trips.length===0 && state.customers.length===0 && state.tariffs.length===0) {
    try {
      const previous=await store.previewLegacyArchive();
      if(previous){await showLegacyArchiveRecovery(previous);return;}
    }catch{ /* Never block the verified account if old device storage is unavailable. */ }
  }
  if(!activationFirstOpen&&(!state.profile.firstName||!state.profile.lastName))openProfile(true);
  if(new URL(location.href).searchParams.get('installa')==='1'&&!isInstalled())installDialog();
 }catch(err){
  if(root.querySelector('.photo-splash') && !(await finishInitialTruckLoading()))return;
  root.replaceChildren(el('div',{class:'boot'},el('img',{src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS'}),el('div',{class:'boot-error'},el('h2',{},'Il registro non è disponibile'),el('p',{class:'subtitle'},err.message||'Controlla la connessione e riprova.'),button('Riprova','primary',()=>initialize(),'refresh'))));
 }
}
// Update the complete read-only corporate catalog while drivers are looking at it.
// The private archive still synchronizes separately in client-store.mjs.
setInterval(()=>{
 if(['insert','tariffs','customers'].includes(tab)&&!document.hidden&&navigator.onLine!==false&&
   store.usingAccount()&&accountAccess.isVerified())void refreshCompanyRates();
},8000);
window.addEventListener('online',()=>{
 if(['insert','tariffs','customers'].includes(tab)&&store.usingAccount()&&accountAccess.isVerified())void refreshCompanyRates();
});
setInterval(()=>{
 if(['insert','customers'].includes(tab)&&!document.hidden&&navigator.onLine!==false&&
   store.usingAccount()&&accountAccess.isVerified())void refreshCompanyCustomers();
},8000);
window.addEventListener('online',()=>{
 if(['insert','customers'].includes(tab)&&store.usingAccount()&&accountAccess.isVerified())void refreshCompanyCustomers();
});
// Pick up new installed-PWA code without overwriting unsaved journeys.
// A fresh service worker controls future requests but existing tabs retain old JS
// until a safe reload. Never force it during a trip edit or pending sync.
const hadAppWorkerAtStartup=Boolean(navigator.serviceWorker?.controller);
let appWorkerChangePending=false,lastAppWorkerCheck=0;
function safeAppUpdateReload(){
 if(!appWorkerChangePending||document.hidden||busy||tab==='insert'||editingId||
    store.getSyncInfo?.().pending||store.getSyncInfo?.().conflict||
    document.querySelector('dialog[open]')||
    document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return false;
 appWorkerChangePending=false;
 location.reload();
 return true;
}
navigator.serviceWorker?.addEventListener('controllerchange',()=>{
 if(!hadAppWorkerAtStartup)return; // First-time service-worker claim is not an update.
 appWorkerChangePending=true;
 if(!safeAppUpdateReload())
  toast('Aggiornamento disponibile: dopo aver salvato, torna al registro e riapri LTS.');
});
async function checkInstalledAppVersion(){
 if(document.hidden||navigator.onLine===false||!navigator.serviceWorker)return;
 if(appWorkerChangePending&&safeAppUpdateReload())return;
 if(Date.now()-lastAppWorkerCheck<60000)return;
 lastAppWorkerCheck=Date.now();
 try{const registration=await navigator.serviceWorker.ready;await registration.update();}
 catch{ /* Offline data and editing remain available even if update checking fails. */ }
}
window.addEventListener('focus',()=>void checkInstalledAppVersion());
window.addEventListener('pageshow',()=>void checkInstalledAppVersion());
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)void checkInstalledAppVersion();
});
setInterval(()=>void checkInstalledAppVersion(),120000);
window.addEventListener('online',()=>realtimeBridge?.resume());
window.addEventListener('focus',()=>realtimeBridge?.resume());
window.addEventListener('offline',()=>realtimeBridge?.resume());
document.addEventListener('visibilitychange',()=>realtimeBridge?.resume());
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
navigator.serviceWorker?.addEventListener('message',event=>{
 const data=event.data;
 if(data?.type!=='LTS_REMINDER_OPEN'||!['insert','register'].includes(data.section))return;
 if(data.section==='register'&&typeof data.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))month=data.month;
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 navigate(data.section);
});
/** Embedded credential entry is disabled where host-level frame headers are unavailable. */
function denyEmbeddedRegister(){
 if(window.top===window.self)return false;
 root.replaceChildren(el('div',{class:'boot boot-error'},
  el('h2',{},'Apri LTS direttamente'),
  el('p',{class:'subtitle'},'Per sicurezza, l’accesso non è disponibile nelle pagine incorporate in altri siti.'),
  el('a',{href:'https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/',target:'_top',rel:'noopener noreferrer'},'Apri LTS nel browser')));
 return true;
}
if(!denyEmbeddedRegister())initialize();
