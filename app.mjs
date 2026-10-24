import * as D from '/LTS-Registro-Viaggi/shared/domain.mjs';
import * as store from '/LTS-Registro-Viaggi/client-store.mjs';
import runtimeConfig from '/LTS-Registro-Viaggi/runtime-config.mjs';
import { appendPushSettings } from '/LTS-Registro-Viaggi/push-client.mjs';
import { parseCustomerCsv, mergeCustomerCsv, exportCustomerCsv, MAX_CUSTOMER_CSV_BYTES } from '/LTS-Registro-Viaggi/shared/customer-csv.mjs';

const root = document.querySelector('#app');
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; };
let state = D.emptyState();
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
let syncWarning = false;
let pdfReport = null;
let toastTimer;
let refreshView = null;
let subscribed = false;
let installPrompt = null;
const standaloneMode = window.matchMedia('(display-mode: standalone)');
const isInstalled = () => standaloneMode.matches || navigator.standalone === true;
const isAppleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
function updateInstallButtons(){document.querySelectorAll('[data-install-trigger]').forEach(node=>node.hidden=isInstalled());}
window.addEventListener('appinstalled',()=>{installPrompt=null;document.querySelector('[data-install-dialog]')?.close();updateInstallButtons();});
standaloneMode.addEventListener?.('change',updateInstallButtons);
const tabs = [{id:'insert',label:'Inserisci viaggio',icon:'addTrip'},{id:'register',label:'Registro viaggi',icon:'calendar'},{id:'customers',label:'Clienti',icon:'users'},{id:'tariffs',label:'Tariffe',icon:'wallet'}];

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
    truck:['M1 3h14v13H1z','M15 8h4l3 4v4h-7','M3 16v2','M17 16v2'],
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
function syncNode(){return el('div',{class:`sync-status${syncWarning?' warning':''}`,id:'sync-status'},el('span',{class:'status-dot'}),syncMessage);}
function setStatus(status){
 const value=typeof status==='string'?status:status?.message||status?.status||'';
 const known={saved:'Dati salvati',saving:'Salvataggio in corso…',syncing:'Salvataggio online in corso…',synced:'Archivio online aggiornato',pending:'Salvato sul dispositivo · sincronizzazione in attesa',conflict:'Modifiche da controllare · apri Profilo → Risolvi sincronizzazione',offline:'Offline · dati conservati su questo dispositivo',error:'Sincronizzazione da verificare',online:'Connessione disponibile',local:'Dati salvati su questo dispositivo'};
 syncMessage=known[value]||value||'Archivio personale';syncWarning=/offline|error|errore|locale|pending|conflict|attesa/i.test(typeof status==='string'?status:status?.status||value);
 const current=document.querySelector('#sync-status');if(current)current.replaceWith(syncNode());
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
function navigate(next){tab=next;searchValue='';render();const scroll=document.querySelector('.app-scroll');if(scroll)scroll.scrollTop=0;window.scrollTo({top:0,behavior:'auto'});}
function render(){
 const scrollTop=document.querySelector('.app-scroll')?.scrollTop||0;
 refreshView=null;
 const frame=el('div',{class:'app-frame'});
 const header=el('header',{class:'topbar'},el('div',{class:'brand'},el('img',{src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS',width:116,height:46}),el('div',{class:'brand-copy'},el('p',{class:'eyebrow'},'Registro viaggi'),el('p',{class:'brand-title'},name()||'Il tuo registro'))),el('div',{class:'header-actions'},el('button',{class:'install-icon-button',type:'button','data-install-trigger':true,hidden:isInstalled(),'aria-label':'Installa app',title:'Installa LTS sul telefono',on:{click:startInstall}},icon('download')),el('button',{class:'profile-button',type:'button','aria-label':`Profilo di ${name()||'autista'}`,title:'Profilo e backup',on:{click:()=>openProfile()}},initials())));
 const main=el('main',{class:`app-main view-${tab}`,id:'main-content'});
 const nav=el('nav',{class:'bottom-nav','aria-label':'Navigazione principale'},tabs.map(item=>el('button',{type:'button',class:`nav-item${tab===item.id?' active':''}`,'aria-current':tab===item.id?'page':null,on:{click:()=>navigate(item.id)}},icon(item.icon),el('span',{},item.label))));
 const scroll=el('div',{class:'app-scroll'},header,main);
 frame.append(scroll,nav);root.replaceChildren(frame);
 if(tab==='insert')renderInsert(main); else if(tab==='register')renderRegister(main);else if(tab==='customers')renderCustomers(main);else renderTariffs(main);
 main.append(syncNode());
 scroll.scrollTop=scrollTop;
}
function receiveState(record,{source}={}){
 // Local saves finish in persist(); background changes update the open view
 // without replacing its inputs or discarding a journey still being typed.
 if(source==='save'||!record?.state)return;
 const changedIdentity=Boolean(user?.id&&record.user?.id!==user.id);
 const previous=state;state=D.validateState(record.state);refreshDraftCustomers(previous,state);user=record.user||null;pdfReport=null;
 if(changedIdentity){
  draft=newDraft();editingId=null;editingBaseline=null;document.querySelectorAll('dialog').forEach(dialog=>dialog.close());render();
  if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
  return;
 }
 const brandName=document.querySelector('.brand-title');if(brandName)brandName.textContent=name()||'Il tuo registro';
 const profile=document.querySelector('.profile-button');
 if(profile){profile.textContent=initials();profile.setAttribute('aria-label',`Profilo di ${name()||'autista'}`);}
 if(refreshView)refreshView();else render();
}
function emptyState(title,message,ico='truck',action=null){return el('section',{class:'panel empty-state'},el('div',{class:'empty-icon'},icon(ico)),el('h3',{},title),el('p',{},message),action);}
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
 const container=decorateTripField(field('Sigla container','container',draft.container,{placeholder:'MSDU345676.8',class:'container-input',required:true,maxlength:500}),'addTrip','container-field');
 const customerListId='trip-customers'; const cityListId='trip-cities';
 const client=decorateTripField(field('Cliente','client',draft.client,{placeholder:'Nome cliente',list:customerListId,required:true,maxlength:500}),'users');
 const city=decorateTripField(field('Località','city',draft.city,{placeholder:'Es. Napoli',list:cityListId,required:true,maxlength:500}),'pin');
 const hint=el('p',{class:'field-hint',id:'tariff-hint'});city.wrap.append(hint);
 form.append(el('div',{class:'trip-fields'},container.wrap,client.wrap,city.wrap),datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client)]));
 let cities=datalist(cityListId,citySuggestions(draft.client));form.append(cities);
 const add=el('button',{type:'button',class:'add-pickup trip-option','aria-label':draft.second?'Rimuovi seconda presa':'Aggiungi una seconda presa','aria-expanded':String(Boolean(draft.second)),on:{click:()=>{collect();draft.second=!draft.second;if(!draft.second){draft.secondClient='';draft.secondCity='';}render();}}},icon('pin'),el('span',{class:'tile-label'},'Seconda presa'),el('span',{class:'plus-disc','aria-hidden':'true'},draft.second?'−':'+'));
 const options=el('div',{class:'trip-options','aria-label':'Opzioni del viaggio'},add);form.append(options);
 let secondClient=null,secondCity=null;
 if(draft.second){
  secondClient=field('Cliente','secondClient',draft.secondClient,{placeholder:'Cliente seconda presa',list:customerListId,required:true,maxlength:500});
  secondCity=field('Località','secondCity',draft.secondCity,{placeholder:'Città seconda presa',list:'second-cities',required:true,maxlength:500});
  form.append(el('section',{class:'second-pickup'},el('div',{class:'pickup-heading'},'Seconda presa · stesso container'),secondClient.wrap,secondCity.wrap,datalist('second-cities',citySuggestions(draft.secondClient))));
  secondClient.input.addEventListener('change',()=>{autofillCity(secondClient.input,secondCity.input);updateEstimate();});
 }
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
  const firstTariff=D.findTariff(state,draft.client,draft.city);const secondTariff=draft.second?D.findTariff(state,draft.secondClient,draft.secondCity):null;
  const existing=state.trips.find(trip=>trip.id===editingId)||null;
  const sameFirst=existing&&D.normalizeText(existing.client)===D.normalizeText(draft.client)&&D.normalizeText(existing.city)===D.normalizeText(draft.city);
  const sameSecond=existing&&D.normalizeText(existing.secondClient)===D.normalizeText(draft.secondClient)&&D.normalizeText(existing.secondCity)===D.normalizeText(draft.secondCity);
  const extraCents=D.emptyExtraRates();
  for(const service of draft.services){const retained=existing?.services?.includes(service)?existing.extraCents?.[service]??null:null;extraCents[service]=state.extraRates[service]??retained;}
  // Build a read-only candidate even while required fields are incomplete.
  // Replace the edited trip so its own daily allowance is not counted twice.
  const candidate={...draft,id:estimateId,createdAt:existing?.createdAt||estimateCreatedAt,fareCents:firstTariff?.cents??(sameFirst?existing.fareCents:null),secondFareCents:draft.second&&draft.secondCity?(secondTariff?.cents??(sameSecond?existing.secondFareCents:null)):null,sumPickupFares:Boolean(draft.second&&draft.secondCity),extraCents};
  const previewContext=D.buildTripAmountContext([...state.trips.filter(trip=>trip.id!==editingId),candidate]);
  const amount=D.tripAmounts(candidate,previewContext);const saturday=D.saturdayAllowanceStatus(candidate,previewContext);
  hint.textContent=firstTariff?`Tariffa collegata · ${D.formatMoney(firstTariff.cents)}`:'';
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
   const trip=D.createTrip(draft,state,existing);
   let next={...state,trips:existing?state.trips.map(t=>t.id===existing.id?trip:t):[...state.trips,trip]};
   const clients=[{name:trip.client,city:trip.city},...(trip.secondClient?[{name:trip.secondClient,city:trip.secondCity}]:[])];
   for(const customer of clients)if(!next.customers.some(c=>c.name===customer.name))next=D.upsertCustomer(next,customer);
   await persist(next);const savedDate=draft.date;editingId=null;editingBaseline=null;draft={...newDraft(),date:savedDate};render();toast(existing?'Viaggio aggiornato.':'Viaggio salvato nel registro.');
  }catch(err){error.textContent=err.message||'Salvataggio non riuscito. Riprova.';save.disabled=false;}
 });
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
  list?.replaceWith(datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client)]));
  const nextCities=datalist(cityListId,citySuggestions(client.input.value));cities.replaceWith(nextCities);cities=nextCities;
  if(secondClient){const list=form.querySelector('#second-cities');list?.replaceWith(datalist('second-cities',citySuggestions(secondClient.input.value)));}
  const latest=D.sortTrips(state.trips)[0];
  const currentAmounts=D.buildTripAmountContext(state);
  recent.replaceChildren(el('p',{class:'recent-heading'},'L’ULTIMO VIAGGIO'),latest?tripCard(latest,currentAmounts):emptyState('Pronto a partire','Inserisci il primo viaggio: lo ritroverai qui e nel resoconto mensile.','truck'),el('p',{class:'hint-row'},icon('info'),'Clienti e località vengono ricordati.'));
 };
}
function citySuggestions(client){const normalized=D.normalizeText(client);return unique([...state.tariffs.filter(t=>t.client===normalized).map(t=>t.city),...state.customers.filter(c=>c.name===normalized).map(c=>c.city),...state.trips.filter(t=>t.client===normalized).map(t=>t.city)]);}
function autofillCity(client,city){if(!city.value.trim()){const normalized=D.normalizeText(client.value);const tariffCities=unique(state.tariffs.filter(t=>t.client===normalized).map(t=>t.city));if(tariffCities.length===1)city.value=tariffCities[0];else if(!tariffCities.length){const customer=state.customers.find(c=>c.name===normalized);if(customer?.city)city.value=customer.city;else{const values=citySuggestions(client.value);if(values.length===1)city.value=values[0];}}}}
function editTrip(trip,{focusNote=false}={}){editingId=trip.id;editingBaseline=tripEditVersion(trip);draft={...trip,services:[...trip.services],second:Boolean(trip.secondClient||trip.secondCity),note:trip.note||'',noteOpen:focusNote||Boolean(trip.note),servicesOpen:true};navigate('insert');if(focusNote)document.querySelector('#trip-note')?.focus();}
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
 return card;
}
function renderRegister(main){
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
function customerTariffs(customer){return state.tariffs.filter(tariff=>tariff.customerId===customer.id||D.normalizeText(tariff.client)===D.normalizeText(customer.name)).sort((a,b)=>a.city.localeCompare(b.city,'it'));}
function customerCard(customer){
 const rates=customerTariffs(customer);
 const content=el('div',{class:'customer-card-main'},el('div',{class:'customer-avatar','aria-hidden':'true'},customer.name.replace(/[^\p{L}\p{N} ]/gu,'').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')),el('div',{class:'catalog-content'},el('h2',{class:'catalog-title'},customer.name),el('p',{class:'catalog-city'},customer.city||'Località da completare'),customer.address?el('p',{class:'catalog-details'},customer.address):null),el('button',{type:'button',class:'icon-button','aria-label':`Modifica cliente ${customer.name}`,on:{click:()=>customerDialog(customer)}},icon('edit')));
 const tariffs=el('div',{class:'customer-linked-rates'},el('div',{class:'customer-rates-heading'},el('span',{class:'customer-rate-count'},icon('link'),rates.length?`${rates.length} ${rates.length===1?'tariffa collegata':'tariffe collegate'}`:'Nessuna tariffa'),button('Tariffe','text',()=>customerDialog(customer,null,{focusRates:true}),'wallet',{'aria-label':`Tariffe cliente ${customer.name}`})));
 if(rates.length)tariffs.append(el('ul',{class:'customer-rate-preview'},rates.slice(0,2).map(rate=>el('li',{},el('span',{},rate.city||'Località da completare'),el('strong',{},D.formatMoney(rate.cents))))));
 else tariffs.append(el('p',{class:'customer-rates-empty'},'Aggiungi la trasferta per ogni località.'));
 return el('article',{class:'panel customer-card'},content,tariffs);
}
function renderCustomers(main){
 main.append(heading('LA TUA RUBRICA','Clienti','Meno digitazione, più tempo per il tuo lavoro.'));
 const list=el('div',{class:'catalog-list'});const count=el('span',{class:'catalog-count'});
 function draw(){const filter=D.normalizeText(searchValue);const customers=[...state.customers].filter(c=>`${c.name} ${c.city} ${c.vat}`.includes(filter)).sort((a,b)=>a.name.localeCompare(b.name,'it'));count.textContent=`${state.customers.length} ${state.customers.length===1?'cliente salvato':'clienti salvati'}`;list.replaceChildren(...customers.map(customerCard));
  if(!customers.length)list.append(emptyState(filter?'Nessun cliente trovato':'La tua rubrica parte da qui',filter?'Prova a cercare un altro nome o una località.':'Aggiungi un cliente oppure salva il tuo primo viaggio.','users',filter?null:button('Aggiungi cliente','primary',()=>customerDialog(),'plus')));
 }
 const csvInput=el('input',{type:'file',accept:'.csv,text/csv',class:'visually-hidden','aria-label':'Importa CSV clienti',on:{change:async event=>{const file=event.target.files?.[0];event.target.value='';if(file)await importCustomersCsv(file);}}});
 main.append(el('section',{class:'panel customer-tools','aria-label':'Strumenti clienti'},button('Da Google Maps','secondary',mapsCustomerDialog,'pin'),el('div',{class:'csv-tools'},button('Importa CSV','text',()=>csvInput.click(),'upload'),button('Esporta CSV','text',()=>{try{downloadBlob(new Blob([exportCustomerCsv(state)],{type:'text/csv;charset=utf-8'}),`LTS-Clienti-${today()}.csv`);toast('Rubrica esportata.');}catch(error){toast(error.message,true);}},'download')),csvInput),searchBox('Cerca cliente, località o partita IVA',draw),el('div',{class:'catalog-top'},count,el('button',{type:'button',class:'text-button',on:{click:()=>customerDialog()}},icon('plus'),'Nuovo cliente')),list);draw();refreshView=draw;
}
function renderTariffs(main){
 main.append(heading('IL VALORE DEI TUOI VIAGGI','Tariffe & extra','Collegate ai clienti. Sempre a portata di mano.'));
 main.append(el('div',{class:'segment','aria-label':'Tipo di tariffa'},el('button',{type:'button',class:tariffTab==='base'?'selected':'','aria-pressed':tariffTab==='base',on:{click:()=>{tariffTab='base';searchValue='';render();}}},'Trasferte'),el('button',{type:'button',class:tariffTab==='extras'?'selected':'','aria-pressed':tariffTab==='extras',on:{click:()=>{tariffTab='extras';render();}}},'Servizi extra')));
 if(tariffTab==='extras'){renderExtraRates(main);return;}
 const list=el('div',{class:'catalog-list'});const count=el('span',{class:'catalog-count'});
 function draw(){const filter=D.normalizeText(searchValue);const tariffs=[...state.tariffs].filter(t=>`${t.client} ${t.city}`.includes(filter)).sort((a,b)=>a.client.localeCompare(b.client,'it')||a.city.localeCompare(b.city,'it'));count.textContent=`${state.tariffs.length} ${state.tariffs.length===1?'tariffa salvata':'tariffe salvate'}`;
 list.replaceChildren(...tariffs.map(tariff=>el('article',{class:'panel tariff-card'},el('div',{class:'tariff-row'},el('div',{class:'catalog-content'},el('h2',{class:'catalog-title'},tariff.client),el('p',{class:'catalog-city'},tariff.city)),el('strong',{class:'tariff-amount'},D.formatMoney(tariff.cents))),el('div',{class:'tariff-footer'},el('span',{class:'linked-label'},icon('link'),'Collegata al cliente'),el('div',{class:'inline-actions'},el('button',{type:'button',class:'icon-button','aria-label':`Modifica tariffa ${tariff.client}, ${tariff.city}`,on:{click:()=>tariffDialog(tariff)}},icon('edit')),el('button',{type:'button',class:'icon-button danger','aria-label':`Elimina tariffa ${tariff.client}, ${tariff.city}`,on:{click:()=>confirmAction('Eliminare questa tariffa?',`${tariff.client} · ${tariff.city}. Gli importi dei viaggi già salvati restano invariati.`,async()=>{requireCurrentEditor(editorVersion(tariff),state.tariffs.find(current=>current.id===tariff.id),'La tariffa');await persist({...state,tariffs:state.tariffs.filter(t=>t.id!==tariff.id)});render();toast('Tariffa eliminata.');})}},icon('trash')))))));
 if(!tariffs.length)list.append(emptyState(filter?'Nessuna tariffa trovata':'Dai un valore a ogni viaggio',filter?'Cerca un altro cliente o un’altra località.':'Imposta una tariffa per cliente e località. La ritroverai automaticamente nel viaggio.','wallet',filter?null:button('Aggiungi tariffa','primary',()=>tariffDialog(),'plus')));
 }
 main.append(searchBox('Cerca cliente o località',draw),el('div',{class:'catalog-top'},count,el('button',{type:'button',class:'text-button',on:{click:()=>tariffDialog()}},icon('plus'),'Nuova tariffa')),list);draw();refreshView=draw;
}
function renderExtraRates(main){
 main.append(el('div',{class:'info-note'},icon('info'),'SABATO TRASFERTA si applica una sola volta nella stessa giornata, anche se selezionato su più viaggi. Gli altri extra si applicano a ogni viaggio, una sola volta anche con due prese. Le modifiche aggiornano anche i viaggi già nel registro.'));
 const form=el('form',{class:'panel form-panel extras-panel',novalidate:true});const error=el('div',{class:'form-error',role:'alert'});form.append(error);
 const inputs={};const dirty=new Set();const dirtyBaseline=new Map();const rates=el('div',{class:'rates-list'});
 for(const service of D.SERVICES){const input=el('input',{id:`rate-${service.key}`,name:service.key,inputmode:'decimal',placeholder:'—',value:moneyInput(state.extraRates[service.key]),'aria-label':`Importo ${service.label}`,maxlength:14,on:{input:()=>{if(!dirty.has(service.key))dirtyBaseline.set(service.key,state.extraRates[service.key]);dirty.add(service.key);}}});inputs[service.key]=input;rates.append(el('div',{class:'rate-row'},el('label',{for:input.id},service.label),el('div',{class:'rate-input'},input,el('span',{},'€'))));}
 form.append(rates,el('div',{style:'height:20px'}),el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),'Salva tariffe extra'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const extraRates={...state.extraRates};for(const key of dirty){requireCurrentEditor(editorVersion(dirtyBaseline.get(key)),state.extraRates[key],`L’importo ${D.SERVICES.find(service=>service.key===key)?.label||'extra'}`);const input=inputs[key];extraRates[key]=input.value.trim()?D.toCents(input.value):null;}await persist(D.upsertExtraRates(state,extraRates));dirty.clear();dirtyBaseline.clear();for(const [key,input]of Object.entries(inputs))input.value=moneyInput(state.extraRates[key]);toast('Tariffe extra e registro aggiornati.');}catch(err){error.textContent=err.message;}});main.append(form);
 refreshView=()=>{for(const [key,input]of Object.entries(inputs))if(!dirty.has(key))input.value=moneyInput(state.extraRates[key]);};
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
function mapsCustomerDialog(){
 const {dialog,body}=modal('Cliente da Google Maps',{subtitle:'Incolla il link condiviso da Google Maps. Potrai controllare e correggere i dati prima di salvarli.'});
 const form=el('form',{novalidate:true});const input=el('input',{type:'url',name:'mapsUrl',placeholder:'https://maps.app.goo.gl/…',autocapitalize:'none',spellcheck:'false',autocomplete:'off',maxlength:4096,'aria-label':'Link Google Maps'});const error=el('div',{class:'form-error',role:'alert'});const submit=el('button',{type:'submit',class:'primary-button full'},icon('pin'),'Leggi link');
 form.append(el('label',{class:'field'},el('span',{},'Link Google Maps'),input),error,submit,button('Compila manualmente','text',()=>{dialog.close();customerDialog(null,{name:'',city:'',address:'',warnings:[]});},null,{class:'text-button full'}));
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.textContent='';const link=input.value.trim();if(!link){error.textContent='Incolla un link Google Maps.';input.focus();return;}
  submit.disabled=true;submit.textContent='Lettura in corso…';const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const endpoint=new URL('/api/maps-client',new URL(runtimeConfig.apiUrl,location.href));
   const response=await fetch(endpoint.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:link}),signal:controller.signal});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Impossibile leggere il link. Puoi compilare i dati manualmente.');
   if(typeof result.name!=='string'||typeof result.city!=='string'||typeof result.address!=='string')throw new Error('Dati Maps incompleti. Compila il cliente manualmente.');
   if(dialog.open){dialog.close();customerDialog(null,result);}
  }catch(err){if(dialog.open)error.textContent=err.name==='AbortError'?'La lettura ha impiegato troppo tempo. Il link è conservato: riprova o compila manualmente.':err.message||'Connessione non disponibile. Il link è conservato: riprova o compila manualmente.';}
  finally{clearTimeout(timeout);submit.disabled=false;submit.replaceChildren(icon('pin'),'Leggi link');}
 });body.append(form);input.focus();
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
 const seed=customer||proposal;const {dialog,body}=modal(customer?'Modifica cliente':proposal?'Controlla cliente da Maps':'Nuovo cliente',{subtitle:proposal?'Controlla nome, città e indirizzo. Completa i dati mancanti: il cliente sarà aggiunto solo premendo Salva cliente.':'I dati del cliente restano collegati alle sue tariffe.'});const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});
 if(proposal?.warnings?.length)form.append(el('p',{class:'info-note'},proposal.warnings.join(' ')));
 const customerName=field('Nome cliente','name',seed?.name||'',{placeholder:'Ragione sociale',required:true,maxlength:500});const city=field('Località','city',seed?.city||'',{placeholder:'Città',optional:true,maxlength:500});const address=field('Indirizzo','address',seed?.address||'',{placeholder:'Via e numero civico',optional:true,maxlength:1000});const vat=field('Partita IVA','vat',seed?.vat||'',{placeholder:'Partita IVA',optional:true,maxlength:100});
 form.append(error,customerName.wrap,city.wrap,address.wrap,vat.wrap);
 const rateRows=[];let rateIndex=0;
 const rateList=el('div',{class:'customer-rate-editors'});const noRates=el('p',{class:'customer-rates-empty'},'Non hai ancora impostato tariffe per questo cliente.');
 const ratesSection=el('section',{class:'customer-rates-section','aria-label':'Tariffe del cliente'},el('div',{class:'customer-rates-title'},icon('wallet'),el('h3',{},'Tariffe del cliente')),el('p',{class:'customer-rates-note'},'Una trasferta per ogni località. Le modifiche aggiornano anche i viaggi già nel registro.'),noRates,rateList);
 function addRate(tariff=null,{focus=true}={}){
  const index=++rateIndex;const initialCity=tariff?tariff.city:(rateRows.length?'':city.input.value);const initialAmount=moneyInput(tariff?.cents);
  const row={tariff,index,dirty:false};const markDirty=()=>{row.dirty=true;};
  row.city=field(`Località tariffa ${index}`,`tariff-city-${index}`,initialCity,{placeholder:'Città del viaggio',maxlength:500,onInput:markDirty});
  row.amount=field(`Trasferta tariffa ${index} €`,`tariff-cents-${index}`,initialAmount,{placeholder:'0,00',inputmode:'decimal',maxlength:14,onInput:markDirty});
  row.element=el('div',{class:'customer-rate-editor','data-rate-row':index},el('div',{class:'customer-rate-editor-top'},el('span',{},`Tariffa ${index}`),tariff?el('span',{class:'customer-rate-saved'},'Collegata'):button('Rimuovi','text',()=>{rateRows.splice(rateRows.indexOf(row),1);row.element.remove();noRates.hidden=Boolean(rateRows.length);},'close',{'aria-label':`Rimuovi nuova tariffa ${index}`,class:'text-button customer-rate-remove'})),el('div',{class:'customer-rate-fields'},row.city.wrap,row.amount.wrap));
  rateRows.push(row);rateList.append(row.element);noRates.hidden=true;
  if(focus){row.element.scrollIntoView({block:'nearest'});(row.city.input.value?row.amount.input:row.city.input).focus();}
 }
 for(const tariff of customer?customerTariffs(customer):[])addRate(tariff,{focus:false});
 ratesSection.append(button('Aggiungi tariffa','secondary',()=>addRate(),'plus',{class:'secondary-button customer-add-rate'}));form.append(ratesSection);
 const actions=el('div',{class:'dialog-actions'});
 if(customer)actions.append(button('Elimina','secondary danger',()=>{
  dialog.close();confirmAction('Eliminare questo cliente?',`${customer.name}. Saranno rimosse anche le sue tariffe. I viaggi già salvati resteranno nel registro.`,async()=>{requireCurrentEditor(expectedCustomer,state.customers.find(current=>current.id===customer.id),'Il cliente');await persist({...state,customers:state.customers.filter(c=>c.id!==customer.id),tariffs:state.tariffs.filter(t=>t.customerId!==customer.id&&t.client!==customer.name)});render();toast('Cliente eliminato.');});
 }));
 actions.append(el('button',{type:'submit',class:'primary-button','data-save':true},'Salva cliente'));form.append(actions);
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{
  const tariffChanges=[];const places=new Set();
  for(const row of rateRows){
   if(!row.tariff&&!row.dirty)continue;
   const place=D.normalizeText(row.city.input.value);const amount=row.amount.input.value.trim();
   if(row.tariff&&!row.dirty){if(place){if(places.has(place))throw new Error(`La località ${place} è già presente: usa una sola tariffa per località.`);places.add(place);}continue;}
   if(!row.tariff&&!place&&!amount)continue;
   if(!place||!amount){(!place?row.city.input:row.amount.input).focus();throw new Error(`Completa località e importo della tariffa ${row.index}, oppure rimuovi la nuova tariffa.`);}
   if(places.has(place)){row.city.input.focus();throw new Error(`La località ${place} è già presente: usa una sola tariffa per località.`);}places.add(place);
   let cents;try{cents=D.toCents(amount);}catch(err){row.amount.input.focus();throw new Error(`Tariffa ${row.index}: ${err.message}`);}
   if(!row.tariff||place!==row.tariff.city||cents!==row.tariff.cents)tariffChanges.push({...(row.tariff?{id:row.tariff.id}:{}),city:place,cents});
  }
  if(customer)requireCurrentEditor(expectedCustomer,state.customers.find(current=>current.id===customer.id),'Il cliente');
  for(const change of tariffChanges)if(change.id){const original=rateRows.find(row=>row.tariff?.id===change.id)?.tariff;requireCurrentEditor(editorVersion(original),state.tariffs.find(current=>current.id===change.id),'La tariffa del cliente');}
  const next=D.upsertCustomerWithTariffs(state,{id:customer?.id,name:customerName.input.value,city:city.input.value,address:address.input.value,vat:vat.input.value},tariffChanges);await persist(next);dialog.close();render();toast('Cliente salvato. Tariffe e viaggi aggiornati.');
 }catch(err){error.textContent=err.message;error.scrollIntoView({block:'nearest'});}});body.append(form);
 if(focusRates){ratesSection.scrollIntoView({block:'start'});if(rateRows.length)rateRows[0].amount.input.focus({preventScroll:true});else ratesSection.querySelector('button').focus({preventScroll:true});}else customerName.input.focus();
}
function tariffDialog(tariff=null){
 const openingTariffs=structuredClone(state.tariffs);
 const {dialog,body}=modal(tariff?'Modifica tariffa':'Nuova tariffa',{subtitle:'Scegli cliente e località: l’importo aggiorna automaticamente anche i viaggi già nel registro.'});const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});
 const client=field('Cliente','client',tariff?.client||'',{placeholder:'Seleziona o scrivi il cliente',list:'tariff-customers',required:true,maxlength:500});const city=field('Località','city',tariff?.city||'',{placeholder:'Città del viaggio',required:true,maxlength:500});const amount=field('Trasferta €','cents',moneyInput(tariff?.cents),{placeholder:'0,00',inputmode:'decimal',required:true,maxlength:14});
 client.input.addEventListener('change',()=>autofillCity(client.input,city.input));
 form.append(error,client.wrap,datalist('tariff-customers',state.customers.map(c=>c.name)),city.wrap,amount.wrap,el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),'Salva tariffa'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const original=tariff||D.findTariff({tariffs:openingTariffs},client.input.value,city.input.value);const current=tariff?state.tariffs.find(row=>row.id===tariff.id):D.findTariff(state,client.input.value,city.input.value);requireCurrentEditor(editorVersion(original),current,'La tariffa');const next=D.upsertTariff(state,{id:tariff?.id,client:client.input.value,city:city.input.value,cents:D.toCents(amount.input.value)});await persist(next);dialog.close();render();toast('Tariffa, cliente e registro aggiornati.');}catch(err){error.textContent=err.message;}});body.append(form);client.input.focus();
}
function openProfile(required=false){
 const expectedProfile=editorVersion(state.profile);
 const {dialog,body}=modal(required?'Benvenuto a bordo':'Il tuo profilo',{required});
 if(required){body.prepend(el('img',{class:'onboarding-logo',src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS'}));body.append(el('div',{class:'onboarding-install','data-install-trigger':true,hidden:isInstalled()},button('Installa app','primary',startInstall,'download',{class:'primary-button full'}),el('p',{},'Porta LTS sulla schermata Home del tuo telefono.')),el('p',{class:'subtitle'},'Inserisci nome e cognome. Compariranno sul tuo resoconto mensile.'));}
 else body.append(el('div',{class:'profile-hero'},el('div',{class:'profile-avatar'},initials()),el('div',{},el('p',{class:'profile-description'},'IL TUO REGISTRO PERSONALE'),el('p',{class:'catalog-title'},name()))));
 const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});const first=field('Nome','firstName',state.profile.firstName,{placeholder:'Il tuo nome',autocomplete:'given-name',required:true,maxlength:200});const last=field('Cognome','lastName',state.profile.lastName,{placeholder:'Il tuo cognome',autocomplete:'family-name',required:true,maxlength:200});
 form.append(error,first.wrap,last.wrap,el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),required?'Inizia a registrare':'Salva profilo'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';if(!first.input.value.trim()||!last.input.value.trim()){error.textContent='Inserisci nome e cognome dell’autista.';(!first.input.value.trim()?first.input:last.input).focus();return;}try{requireCurrentEditor(expectedProfile,state.profile,'Il profilo');await persist({...state,profile:{firstName:D.normalizeText(first.input.value),lastName:D.normalizeText(last.input.value)}});dialog.close();render();toast('Profilo salvato.');}catch(err){error.textContent=err.message;}});body.append(form);
 if(required)body.append(button('Hai già LTS? Collega dispositivi','text',()=>{dialog.close();deviceLinkDialog();},'link',{class:'text-button full'}));
 if(!required){
  const importInput=el('input',{type:'file',accept:'.json,.zip,application/json,application/zip',class:'visually-hidden','aria-label':'Seleziona un backup',on:{change:async event=>{const file=event.target.files?.[0];if(!file)return;dialog.close();await importFile(file);}}});
  const installItem=menuButton('Installa app','Aggiungi LTS alla schermata Home.','download',startInstall);installItem.dataset.installTrigger='';installItem.hidden=isInstalled();
  body.append(el('div',{class:'profile-separator'}),el('p',{class:'section-label'},'I tuoi dati'),el('div',{class:'profile-menu'},menuButton('Sincronizza adesso','Invia online le modifiche salvate sul telefono.','cloud',async()=>{try{const result=await store.syncPending();if(result?.state)state=D.validateState(result.state);dialog.close();render();toast('Sincronizzazione completata.');}catch(err){toast(err.message||'Sincronizzazione non riuscita.',true);}}),menuButton('Esporta backup','Salva una copia in File o su Google Drive.','download',()=>downloadBackup()),menuButton('Importa backup','Backup web JSON o archivio Android ZIP.','upload',()=>importInput.click()),menuButton('Ricarica dati online','Recupera la versione online dopo aver conservato un backup.','refresh',()=>{dialog.close();confirmAction('Ricaricare i dati online?','Prima esporta un backup. Le modifiche non sincronizzate sul telefono saranno sostituite dai dati online.',async()=>{const result=await store.loadState({preferRemote:true});state=D.validateState(result.state);user=result.user||null;draft=newDraft();editingId=null;editingBaseline=null;render();toast('Registro online ricaricato.');},'Ricarica');}),installItem,importInput));
  appendPushSettings(body,{apiRequest:store.pushRequest,toast});
  const syncInfo=store.getSyncInfo();
  body.querySelector('.profile-menu').prepend(menuButton('Collega dispositivi',syncInfo.linked?'Archivio condiviso: viaggi, clienti e tariffe si aggiornano online.':'Collega iPhone e Android con un codice temporaneo.','link',()=>{dialog.close();deviceLinkDialog();}));
  if(syncInfo.conflict)body.querySelector('.profile-menu').prepend(menuButton('Risolvi sincronizzazione','Controlla le due copie: nessuna modifica viene scartata automaticamente.','info',()=>{dialog.close();syncConflictDialog();}));
  body.querySelector('.profile-menu').append(menuButton('Esporta per Android','ZIP compatibile da importare nell’app LTS Android.','download',downloadAndroidBackup));
  body.append(el('div',{class:'info-note',style:'margin-top:17px;margin-bottom:0'},icon('lock'),'Il PDF mensile contiene viaggi e servizi. Le tariffe e gli importi restano solo nell’app.'));
  body.append(el('p',{class:'subtle-footer'},syncInfo.linked?'Dispositivi collegati allo stesso archivio. Le modifiche si sincronizzano quando l’app è aperta e connessa. Conserva un backup prima di cancellare i dati di Safari.':'Accesso libero, senza password. Collega i dispositivi con un codice per condividere il tuo archivio. Lo stesso nome autista non collega automaticamente i dati.'));
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
  confirmAction('Ripristinare il backup?',`Il file contiene ${imported.trips.length} viaggi, ${imported.customers.length} clienti e ${imported.tariffs.length} tariffe. Sostituirà il registro attuale. Prima di continuare conserva una copia dei tuoi dati.`,async()=>{await persist(imported);draft=newDraft();editingId=null;editingBaseline=null;month=state.trips.length?D.sortTrips(state.trips)[0].date.slice(0,7):today().slice(0,7);navigate('register');toast('Backup ripristinato.');if(!state.profile.firstName||!state.profile.lastName)openProfile(true);},'Ripristina');
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
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri questa pagina in Safari'),el('p',{},'Se sei dentro ChatGPT o un’altra app, copia il link qui sotto e incollalo in Safari.'))),el('li',{},el('div',{},el('strong',{},icon('share'),'Tocca Condividi'),el('p',{},'Cerca il quadrato con la freccia verso l’alto. Può essere nel menu di Safari.'))),el('li',{},el('div',{},el('strong',{},'Aggiungi alla schermata Home'),el('p',{},'Se compare “Apri come app web”, attivalo. Poi premi “Aggiungi”.'))));
  body.append(steps,el('div',{class:'info-note'},icon('info'),'La conferma finale si fa nel menu di Safari. Se manca la voce, scorri fino a “Modifica azioni”.'));
 }else{
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri il menu del browser'),el('p',{},'Su telefono cerca il pulsante ⋮ o il menu Condividi.'))),el('li',{},el('div',{},el('strong',{},'Scegli “Installa app”'),el('p',{},'Può chiamarsi anche “Aggiungi alla schermata Home”. Su iPhone usa Condividi in Safari.'))),el('li',{},el('div',{},el('strong',{},'Conferma l’aggiunta'),el('p',{},'Apri LTS dalla nuova icona sul telefono.'))));body.append(steps);
 }
 const manifest=document.querySelector('link[rel="manifest"]');const url=new URL('./',manifest?.href||location.href).href;
 const link=el('input',{type:'url',value:url,readonly:true,'aria-label':'Link dell’app LTS',class:'install-url'});
 const copy=button('Copia link','secondary',async()=>{try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(url);copy.textContent='Link copiato';}catch{link.focus();link.select();toast('Tieni premuto sul link e scegli Copia.');}},'link');
 body.append(el('div',{class:'install-link'},link,copy),button('Torna al registro','text',()=>dialog.close(),null,{class:'text-button full'}));
}
async function initialize(){
 try{
  const result=await store.loadState();state=D.validateState(result?.state||result);user=result?.user||null;
  const subscribe=store.subscribeStatus||store.onStatus;if(subscribe)subscribe(setStatus);
  if(!subscribed&&store.subscribeState){store.subscribeState(receiveState);subscribed=true;}
  if(result?.status)setStatus(result.status);
  const notificationTab=location.hash.slice(1);if(['insert','register'].includes(notificationTab))tab=notificationTab;
  render();if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
  if(new URL(location.href).searchParams.get('installa')==='1'&&!isInstalled())installDialog();
 }catch(err){
  root.replaceChildren(el('div',{class:'boot'},el('img',{src:'/LTS-Registro-Viaggi/assets/lts-logo.png',alt:'LTS'}),el('div',{class:'boot-error'},el('h2',{},'Il registro non è disponibile'),el('p',{class:'subtitle'},err.message||'Controlla la connessione e riprova.'),button('Riprova','primary',()=>initialize(),'refresh'))));
 }
}
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
navigator.serviceWorker?.addEventListener('message',event=>{
 const data=event.data;
 if(data?.type!=='LTS_REMINDER_OPEN'||!['insert','register'].includes(data.section))return;
 if(data.section==='register'&&typeof data.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))month=data.month;
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 navigate(data.section);
});
initialize();
