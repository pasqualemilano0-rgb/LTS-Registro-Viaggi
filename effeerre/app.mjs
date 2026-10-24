import * as D from '/LTS-Registro-Viaggi/effeerre/shared/domain.mjs';
import * as store from '/LTS-Registro-Viaggi/effeerre/client-store.mjs';

const root = document.querySelector('#app');
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; };
let state = D.emptyState();
let user = null;
let tab = 'insert';
let tariffTab = 'base';
let month = today().slice(0,7);
let editingId = null;
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
const tabs = [{id:'insert',label:'Inserisci',icon:'addTrip'},{id:'register',label:'Registro',icon:'calendar'},{id:'customers',label:'Clienti',icon:'users'},{id:'tariffs',label:'Tariffe',icon:'wallet'}];

function newDraft() { return {date:today(),client:'',city:'',container:'',secondClient:'',secondCity:'',services:[],second:false}; }
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
const initials = () => [state.profile.firstName,state.profile.lastName].map(v=>v?.[0]||'').join('') || 'ER';
function formatDate(date) { return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${date}T12:00:00`)); }
function moneyInput(cents) { return cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',','); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it')); }
function toast(message,error=false) {
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const node=el('div',{class:`toast${error?' error':''}`,role:error?'alert':'status'},message);document.body.append(node);
  toastTimer=setTimeout(()=>node.remove(),error?6500:3600);
}
function heading(kicker,title,subtitle,aside=null) {
 return el('div',{class:'view-head'},el('div',{},el('p',{class:'eyebrow'},kicker),el('h1',{},title),el('p',{class:'subtitle'},subtitle)),aside);
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
function datalist(id,values){return el('datalist',{id},unique(values).map(value=>el('option',{value})));}
function syncNode(){return el('div',{class:`sync-status${syncWarning?' warning':''}`,id:'sync-status'},el('span',{class:'status-dot'}),syncMessage);}
function setStatus(status){
 const value=typeof status==='string'?status:status?.message||status?.status||'';
 const known={saved:'Dati salvati',saving:'Salvataggio in corso…',syncing:'Salvataggio online in corso…',synced:'Archivio online aggiornato',pending:'Salvato sul dispositivo · sincronizzazione in attesa',conflict:'Dati online cambiati · conserva un backup prima di ricaricare',offline:'Offline · dati conservati su questo dispositivo',error:'Sincronizzazione da verificare',online:'Connessione disponibile',local:'Dati salvati su questo dispositivo'};
 syncMessage=known[value]||value||'Archivio personale';syncWarning=/offline|error|errore|locale|pending|conflict|attesa/i.test(typeof status==='string'?status:status?.status||value);
 const current=document.querySelector('#sync-status');if(current)current.replaceWith(syncNode());
}
async function persist(nextState){
 if(busy)throw new Error('Attendi il salvataggio in corso.');
 busy=true;document.querySelectorAll('[data-save]').forEach(node=>node.disabled=true);
 try{
  const checked=D.validateState(nextState);
  const result=await store.saveState(checked);
  state=result?.state?D.validateState(result.state):checked;
  pdfReport=null;
  return state;
 }catch(error){if(error.pendingState)state=D.validateState(error.pendingState);throw error;
 }finally{busy=false;document.querySelectorAll('[data-save]').forEach(node=>node.disabled=false);}
}
function navigate(next){tab=next;searchValue='';render();window.scrollTo({top:0,behavior:'auto'});}
function render(){
 refreshView=null;
 const frame=el('div',{class:'app-frame'});
 const header=el('header',{class:'topbar'},el('div',{class:'brand'},el('img',{src:'/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo.png',alt:'EFFE.ERRE TRASPORTI',width:116,height:46}),el('div',{class:'brand-copy'},el('p',{class:'eyebrow'},'Il tuo spazio personale'),el('p',{class:'brand-title'},'Registro Viaggi'))),el('div',{class:'header-actions'},el('button',{class:'install-icon-button',type:'button','data-install-trigger':true,hidden:isInstalled(),'aria-label':'Installa app',title:'Installa EFFE.ERRE sul telefono',on:{click:startInstall}},icon('download')),el('button',{class:'profile-button',type:'button','aria-label':`Profilo di ${name()||'autista'}`,title:'Profilo e backup',on:{click:()=>openProfile()}},initials())));
 const main=el('main',{class:'app-main',id:'main-content'});
 const nav=el('nav',{class:'bottom-nav','aria-label':'Navigazione principale'},tabs.map(item=>el('button',{type:'button',class:`nav-item${tab===item.id?' active':''}`,'aria-current':tab===item.id?'page':null,on:{click:()=>navigate(item.id)}},icon(item.icon),el('span',{},item.label))));
 frame.append(header,main,nav);root.replaceChildren(frame);
 if(tab==='insert')renderInsert(main); else if(tab==='register')renderRegister(main);else if(tab==='customers')renderCustomers(main);else renderTariffs(main);
 main.append(syncNode());
}
function receiveState(record,{source}={}){
 // Local saves finish in persist(); background changes update the open view
 // without replacing its inputs or discarding a journey still being typed.
 if(source==='save'||!record?.state)return;
 const changedIdentity=Boolean(user?.id&&record.user?.id!==user.id);
 state=D.validateState(record.state);user=record.user||null;pdfReport=null;
 if(changedIdentity){
  draft=newDraft();editingId=null;document.querySelectorAll('dialog').forEach(dialog=>dialog.close());render();
  if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
  return;
 }
 const profile=document.querySelector('.profile-button');
 if(profile){profile.textContent=initials();profile.setAttribute('aria-label',`Profilo di ${name()||'autista'}`);}
 if(refreshView)refreshView();else render();
}
function emptyState(title,message,ico='truck',action=null){return el('section',{class:'panel empty-state'},el('div',{class:'empty-icon'},icon(ico)),el('h3',{},title),el('p',{},message),action);}
function renderInsert(main){
 const first=state.profile.firstName?state.profile.firstName[0]+state.profile.firstName.slice(1).toLocaleLowerCase('it-IT'):'';
 main.append(heading(first?`BUON VIAGGIO, ${first}`:'IL TUO REGISTRO EFFE.ERRE',editingId?'Modifica viaggio':'Inserisci viaggio','Un viaggio alla volta. Al resto pensiamo noi.',el('span',{class:'head-badge'},icon('lock'),'Spazio personale')));
 const layout=el('div',{class:'form-layout'});const form=el('form',{class:'panel form-panel',novalidate:true});
 const error=el('div',{class:'form-error',role:'alert'});
 form.append(error);
 if(editingId)form.append(el('div',{class:'editing-banner'},'Stai modificando un viaggio',el('button',{type:'button',class:'remove-button',on:{click:()=>{editingId=null;draft=newDraft();render();}}},'Annulla')));
 form.append(el('p',{class:'section-label'},icon('truck'),'Dati del viaggio'));
 const date=field('Data','date',draft.date,{type:'date',required:true,min:'1900-01-01',max:'2199-12-31'});
 const container=field('Sigla container','container',draft.container,{placeholder:'MSDU345676.8',class:'container-input',required:true,maxlength:500});
 form.append(el('div',{class:'trip-top-row'},date.wrap,container.wrap));
 const customerListId='trip-customers'; const cityListId='trip-cities';
 const client=field('Cliente','client',draft.client,{placeholder:'Seleziona o scrivi un cliente',list:customerListId,required:true,maxlength:500});
 const city=field('Località','city',draft.city,{placeholder:'Città del viaggio',list:cityListId,required:true,maxlength:500});
 const hint=el('p',{class:'field-hint',id:'tariff-hint'});city.wrap.append(hint);
 form.append(client.wrap,city.wrap,datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client)]));
 let cities=datalist(cityListId,citySuggestions(draft.client));form.append(cities);
 const add=el('button',{type:'button',class:'add-pickup',on:{click:()=>{collect();draft.second=!draft.second;if(!draft.second){draft.secondClient='';draft.secondCity='';}render();}}},el('span',{class:'plus-disc'},draft.second?'−':'+'),draft.second?'Rimuovi seconda presa':'Aggiungi una seconda presa');
 form.append(add);
 let secondClient=null,secondCity=null;
 if(draft.second){
  secondClient=field('Cliente','secondClient',draft.secondClient,{placeholder:'Cliente seconda presa',list:customerListId,required:true,maxlength:500});
  secondCity=field('Località','secondCity',draft.secondCity,{placeholder:'Città seconda presa',list:'second-cities',required:true,maxlength:500});
  form.append(el('section',{class:'second-pickup'},el('div',{class:'pickup-heading'},'Seconda presa · stesso container'),secondClient.wrap,secondCity.wrap,datalist('second-cities',citySuggestions(draft.secondClient))));
  secondClient.input.addEventListener('change',()=>autofillCity(secondClient.input,secondCity.input));
 }
 form.append(el('div',{class:'form-rule'}),el('p',{class:'section-label'},icon('plus'),'Servizi extra'));
 const services=el('div',{class:'service-grid'},D.SERVICES.map(service=>el('label',{class:'service-chip'},el('input',{type:'checkbox',name:'service',value:service.key,'aria-label':service.label,checked:draft.services.includes(service.key),on:{change:()=>{collect();updateEstimate();}}}),el('span',{class:'chip-check','aria-hidden':'true'},'✓'),service.label)));
 form.append(services);
 const estimate=el('div',{class:'preview-total'});const missing=el('p',{class:'missing-note'});form.append(estimate,missing);
 const save=el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),editingId?'Salva modifiche':'Salva viaggio');
 form.append(save,el('p',{class:'privacy-footnote'},icon('lock'),'Le tariffe restano nell’app, mai nel PDF.'));
 function collect(){draft={date:date.input.value,container:container.input.value,client:client.input.value,city:city.input.value,secondClient:secondClient?.input.value||'',secondCity:secondCity?.input.value||'',services:[...form.querySelectorAll('[name=service]:checked')].map(n=>n.value),second:draft.second};}
 function updateEstimate(){
  collect();
  const firstTariff=D.findTariff(state,draft.client,draft.city);const secondTariff=draft.second?D.findTariff(state,draft.secondClient,draft.secondCity):null;
  const extra=draft.services.reduce((sum,key)=>sum+(state.extraRates[key]||0),0);const total=(firstTariff?.cents||0)+(secondTariff?.cents||0)+extra;
  hint.textContent=firstTariff?`Tariffa collegata · ${D.formatMoney(firstTariff.cents)}`:'';
  estimate.replaceChildren(el('span',{},draft.second?'Trasferte + extra del viaggio':'Trasferta + extra'),el('strong',{},D.formatMoney(total)));
  const hasAny=Boolean(draft.client||draft.city||draft.services.length);const unknown=(!firstTariff&&Boolean(draft.client&&draft.city))||(draft.second&&!secondTariff&&Boolean(draft.secondClient&&draft.secondCity))||draft.services.some(key=>state.extraRates[key]===null);
  missing.textContent=hasAny&&unknown?'Alcune tariffe non sono impostate. Puoi comunque salvare il viaggio.':'';
  missing.style.marginBottom=missing.textContent?'16px':'0';
 }
 for(const {input}of[date,container,client,city,...(secondClient?[secondClient,secondCity]:[])])input.addEventListener('input',()=>{collect();updateEstimate();});
 client.input.addEventListener('change',()=>{autofillCity(client.input,city.input);const next=datalist(cityListId,citySuggestions(client.input.value));cities.replaceWith(next);cities=next;updateEstimate();});
 container.input.addEventListener('blur',()=>{container.input.value=D.normalizeContainer(container.input.value);collect();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;collect();error.textContent='';form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  const checked=D.validateTrip(draft);
  if(!checked.valid){error.textContent=Object.values(checked.errors)[0];const firstBad=form.elements[Object.keys(checked.errors)[0]];if(firstBad instanceof HTMLElement){firstBad.setAttribute('aria-invalid','true');firstBad.focus();}return;}
  save.disabled=true;
  try{
   const existing=state.trips.find(t=>t.id===editingId)||null;const trip=D.createTrip(draft,state,existing);
   let next={...state,trips:existing?state.trips.map(t=>t.id===existing.id?trip:t):[...state.trips,trip]};
   const clients=[{name:trip.client,city:trip.city},...(trip.secondClient?[{name:trip.secondClient,city:trip.secondCity}]:[])];
   for(const customer of clients)if(!next.customers.some(c=>c.name===customer.name))next=D.upsertCustomer(next,customer);
   await persist(next);const savedDate=draft.date;editingId=null;draft={...newDraft(),date:savedDate};render();toast(existing?'Viaggio aggiornato.':'Viaggio salvato nel registro.');
  }catch(err){error.textContent=err.message||'Salvataggio non riuscito. Riprova.';save.disabled=false;}
 });
 updateEstimate();layout.append(form);
 const recent=el('aside',{class:'recent-preview'},el('p',{class:'recent-heading'},'L’ULTIMO VIAGGIO'));
 const latest=D.sortTrips(state.trips)[0];
 recent.append(latest?tripCard(latest):emptyState('Pronto a partire','Inserisci il primo viaggio: lo ritroverai qui e nel resoconto mensile.','truck'));
 recent.append(el('p',{class:'hint-row'},icon('info'),'Clienti e località vengono ricordati.'));
 layout.append(recent);main.append(layout);
 refreshView=()=>{
  updateEstimate();
  const list=form.querySelector(`#${customerListId}`);
  list?.replaceWith(datalist(customerListId,[...state.customers.map(c=>c.name),...state.trips.map(t=>t.client)]));
  const nextCities=datalist(cityListId,citySuggestions(client.input.value));cities.replaceWith(nextCities);cities=nextCities;
  if(secondClient){const list=form.querySelector('#second-cities');list?.replaceWith(datalist('second-cities',citySuggestions(secondClient.input.value)));}
  const latest=D.sortTrips(state.trips)[0];
  recent.replaceChildren(el('p',{class:'recent-heading'},'L’ULTIMO VIAGGIO'),latest?tripCard(latest):emptyState('Pronto a partire','Inserisci il primo viaggio: lo ritroverai qui e nel resoconto mensile.','truck'),el('p',{class:'hint-row'},icon('info'),'Clienti e località vengono ricordati.'));
 };
}
function citySuggestions(client){const normalized=D.normalizeText(client);return unique([...state.tariffs.filter(t=>t.client===normalized).map(t=>t.city),...state.customers.filter(c=>c.name===normalized).map(c=>c.city),...state.trips.filter(t=>t.client===normalized).map(t=>t.city)]);}
function autofillCity(client,city){if(!city.value.trim()){const values=citySuggestions(client.value);if(values.length===1)city.value=values[0];}}
function editTrip(trip){editingId=trip.id;draft={...trip,services:[...trip.services],second:Boolean(trip.secondClient||trip.secondCity)};navigate('insert');}
function tripCard(trip){
 const amount=D.tripAmounts(trip);
 const card=el('article',{class:'panel trip-card'},el('div',{class:'trip-meta'},el('span',{class:'date-badge'},formatDate(trip.date)),el('span',{class:'trip-money',title:amount.missingTariff?'Totale parziale: alcune tariffe non sono impostate':'Trasferta ed extra'},D.formatMoney(amount.totalCents),amount.missingTariff?' *':'')),el('h3',{class:'trip-container'},trip.container),el('p',{class:'trip-client'},trip.client),el('p',{class:'trip-location'},icon('pin'),trip.city));
 if(trip.secondClient)card.append(el('p',{class:'trip-location'},icon('plus'),`${trip.secondClient} · ${trip.secondCity}`));
 if(trip.services.length)card.append(el('div',{class:'trip-services'},trip.services.map(key=>el('span',{class:'mini-chip'},D.SERVICES.find(s=>s.key===key)?.label||key))));
 card.append(el('div',{class:'trip-card-footer'},el('p',{class:'trip-breakdown'},`Prese ${D.formatMoney(amount.pickupCents)} · Extra ${D.formatMoney(amount.extraCents)}`),el('div',{class:'inline-actions'},el('button',{type:'button',class:'icon-button','aria-label':`Modifica viaggio ${trip.container} del ${formatDate(trip.date)}`,on:{click:()=>editTrip(trip)}},icon('edit')),el('button',{type:'button',class:'icon-button danger','aria-label':`Elimina viaggio ${trip.container} del ${formatDate(trip.date)}`,on:{click:()=>confirmAction('Eliminare questo viaggio?',`${trip.container} · ${formatDate(trip.date)}. Il viaggio sarà rimosso dal registro.`,async()=>{await persist({...state,trips:state.trips.filter(t=>t.id!==trip.id)});render();toast('Viaggio eliminato.');})}},icon('trash')))));
 return card;
}
function renderRegister(main){
 main.append(heading('TUTTO AL SUO POSTO','Registro mensile','I tuoi viaggi, dal più recente al meno recente.',el('div',{class:'month-control'},el('label',{class:'visually-hidden',for:'month-select'},'Mese del registro'),el('input',{id:'month-select',type:'month',value:month,min:'1900-01',max:'2199-12',on:{change:event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){month=event.target.value;pdfReport=null;render();}}}}))));
 const summary=D.monthlySummary(state,month);const trips=D.monthlyTrips(state,month);
 main.append(el('section',{class:'panel overview','aria-label':'Riepilogo del mese'},el('div',{class:'overview-top'},el('div',{},el('p',{class:'overview-label'},'Totale trasferte ed extra'),el('p',{class:'overview-amount'},D.formatMoney(summary.totalCents))),el('span',{class:'trip-count'},`${summary.count} ${summary.count===1?'viaggio':'viaggi'}`)),el('div',{class:'overview-bottom'},el('div',{},'TRASFERTE',el('strong',{},D.formatMoney(summary.pickupCents))),el('div',{},'SERVIZI EXTRA',el('strong',{},D.formatMoney(summary.extraCents))))));
 if(summary.missingTariffCount)main.append(el('p',{class:'missing-note',style:'margin-top:10px'},`${summary.missingTariffCount} ${summary.missingTariffCount===1?'viaggio ha tariffe mancanti':'viaggi hanno tariffe mancanti'}: il totale potrebbe essere parziale.`));
 const pdf=el('button',{type:'button',class:'pdf-button',disabled:!trips.length,on:{click:async()=>{
  pdf.disabled=true;try{
   const module=await import('/LTS-Registro-Viaggi/effeerre/shared/pdf.mjs');const logo=await module.loadPdfLogo();pdfReport=module.generateMonthlyPdf({state,month,logoDataUrl:logo});render();toast('PDF pronto: aprilo o condividilo.');
  }catch(err){toast(err.message||'Impossibile creare il PDF.',true);pdf.disabled=false;}
 }}},icon('pdf'),'Genera PDF');
 main.append(el('div',{class:'month-row'},el('h2',{},'Viaggi del mese'),pdf));
 if(pdfReport){const report=pdfReport;main.append(el('div',{class:'panel pdf-ready'},icon('pdf'),el('p',{},'Il tuo resoconto è pronto',el('small',{},`${report.pages} ${report.pages===1?'pagina':'pagine'} · senza importi`)),button('Apri / condividi','secondary',async()=>{try{const module=await import('/LTS-Registro-Viaggi/effeerre/shared/pdf.mjs');await module.shareOrDownloadPdf(report);}catch(err){if(err.name!=='AbortError')toast(err.message||'Impossibile aprire il PDF.',true);}},'share')));}
 if(trips.length)main.append(el('div',{class:'trip-list',style:pdfReport?'margin-top:16px':''},trips.map(tripCard)));
 else main.append(emptyState('Il mese è tutto da scrivere','Qui compariranno i viaggi inseriti per il mese selezionato.','calendar',button('Inserisci un viaggio','primary',()=>navigate('insert'),'plus')));
 main.append(el('p',{class:'subtle-footer'},'Scorri liberamente: tutti i viaggi del mese sono qui.'));
}
function searchBox(placeholder,onSearch){const input=el('input',{type:'search',placeholder,value:searchValue,'aria-label':placeholder,autocapitalize:'characters',on:{input:event=>{searchValue=event.target.value;onSearch();}}});return el('div',{class:'search'},icon('search'),input);}
function renderCustomers(main){
 main.append(heading('LA TUA RUBRICA','Clienti','Meno digitazione, più tempo per il tuo lavoro.'));
 const list=el('div',{class:'catalog-list'});const count=el('span',{class:'catalog-count'});
 function draw(){const filter=D.normalizeText(searchValue);const customers=[...state.customers].filter(c=>`${c.name} ${c.city}`.includes(filter)).sort((a,b)=>a.name.localeCompare(b.name,'it'));count.textContent=`${state.customers.length} ${state.customers.length===1?'cliente salvato':'clienti salvati'}`;list.replaceChildren(...customers.map(customer=>el('article',{class:'panel customer-card'},el('div',{class:'customer-avatar','aria-hidden':'true'},customer.name.replace(/[^\p{L}\p{N} ]/gu,'').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')),el('div',{class:'catalog-content'},el('h2',{class:'catalog-title'},customer.name),el('p',{class:'catalog-city'},customer.city||'Località da completare'),customer.address?el('p',{class:'catalog-details'},customer.address):null),el('button',{type:'button',class:'icon-button','aria-label':`Modifica cliente ${customer.name}`,on:{click:()=>customerDialog(customer)}},icon('edit')))));
  if(!customers.length)list.append(emptyState(filter?'Nessun cliente trovato':'La tua rubrica parte da qui',filter?'Prova a cercare un altro nome o una località.':'Aggiungi un cliente oppure salva il tuo primo viaggio.','users',filter?null:button('Aggiungi cliente','primary',()=>customerDialog(),'plus')));
 }
 main.append(searchBox('Cerca cliente o località',draw),el('div',{class:'catalog-top'},count,el('button',{type:'button',class:'text-button',on:{click:()=>customerDialog()}},icon('plus'),'Nuovo cliente')),list);draw();refreshView=draw;
}
function renderTariffs(main){
 main.append(heading('IL VALORE DEI TUOI VIAGGI','Tariffe & extra','Collegate ai clienti. Sempre a portata di mano.'));
 main.append(el('div',{class:'segment','aria-label':'Tipo di tariffa'},el('button',{type:'button',class:tariffTab==='base'?'selected':'','aria-pressed':tariffTab==='base',on:{click:()=>{tariffTab='base';searchValue='';render();}}},'Trasferte'),el('button',{type:'button',class:tariffTab==='extras'?'selected':'','aria-pressed':tariffTab==='extras',on:{click:()=>{tariffTab='extras';render();}}},'Servizi extra')));
 if(tariffTab==='extras'){renderExtraRates(main);return;}
 const list=el('div',{class:'catalog-list'});const count=el('span',{class:'catalog-count'});
 function draw(){const filter=D.normalizeText(searchValue);const tariffs=[...state.tariffs].filter(t=>`${t.client} ${t.city}`.includes(filter)).sort((a,b)=>a.client.localeCompare(b.client,'it')||a.city.localeCompare(b.city,'it'));count.textContent=`${state.tariffs.length} ${state.tariffs.length===1?'tariffa salvata':'tariffe salvate'}`;
 list.replaceChildren(...tariffs.map(tariff=>el('article',{class:'panel tariff-card'},el('div',{class:'tariff-row'},el('div',{class:'catalog-content'},el('h2',{class:'catalog-title'},tariff.client),el('p',{class:'catalog-city'},tariff.city)),el('strong',{class:'tariff-amount'},D.formatMoney(tariff.cents))),el('div',{class:'tariff-footer'},el('span',{class:'linked-label'},icon('link'),'Collegata al cliente'),el('div',{class:'inline-actions'},el('button',{type:'button',class:'icon-button','aria-label':`Modifica tariffa ${tariff.client}, ${tariff.city}`,on:{click:()=>tariffDialog(tariff)}},icon('edit')),el('button',{type:'button',class:'icon-button danger','aria-label':`Elimina tariffa ${tariff.client}, ${tariff.city}`,on:{click:()=>confirmAction('Eliminare questa tariffa?',`${tariff.client} · ${tariff.city}. Gli importi dei viaggi già salvati restano invariati.`,async()=>{await persist({...state,tariffs:state.tariffs.filter(t=>t.id!==tariff.id)});render();toast('Tariffa eliminata.');})}},icon('trash')))))));
 if(!tariffs.length)list.append(emptyState(filter?'Nessuna tariffa trovata':'Dai un valore a ogni viaggio',filter?'Cerca un altro cliente o un’altra località.':'Imposta una tariffa per cliente e località. La ritroverai automaticamente nel viaggio.','wallet',filter?null:button('Aggiungi tariffa','primary',()=>tariffDialog(),'plus')));
 }
 main.append(searchBox('Cerca cliente o località',draw),el('div',{class:'catalog-top'},count,el('button',{type:'button',class:'text-button',on:{click:()=>tariffDialog()}},icon('plus'),'Nuova tariffa')),list);draw();refreshView=draw;
}
function renderExtraRates(main){
 main.append(el('div',{class:'info-note'},icon('info'),'Gli extra si applicano una sola volta al viaggio, anche con due prese. Le modifiche aggiornano anche i viaggi già nel registro.'));
 const form=el('form',{class:'panel form-panel extras-panel',novalidate:true});const error=el('div',{class:'form-error',role:'alert'});form.append(error);
 const inputs={};const dirty=new Set();const rates=el('div',{class:'rates-list'});
 for(const service of D.SERVICES){const input=el('input',{id:`rate-${service.key}`,name:service.key,inputmode:'decimal',placeholder:'—',value:moneyInput(state.extraRates[service.key]),'aria-label':`Importo ${service.label}`,maxlength:14,on:{input:()=>dirty.add(service.key)}});inputs[service.key]=input;rates.append(el('div',{class:'rate-row'},el('label',{for:input.id},service.label),el('div',{class:'rate-input'},input,el('span',{},'€'))));}
 form.append(rates,el('div',{style:'height:20px'}),el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),'Salva tariffe extra'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const extraRates={...state.extraRates};for(const key of dirty){const input=inputs[key];extraRates[key]=input.value.trim()?D.toCents(input.value):null;}await persist(D.upsertExtraRates(state,extraRates));dirty.clear();for(const [key,input]of Object.entries(inputs))input.value=moneyInput(state.extraRates[key]);toast('Tariffe extra e registro aggiornati.');}catch(err){error.textContent=err.message;}});main.append(form);
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
function customerDialog(customer=null){
 const {dialog,body}=modal(customer?'Modifica cliente':'Nuovo cliente',{subtitle:'I dati del cliente restano collegati alle sue tariffe.'});const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});
 const customerName=field('Nome cliente','name',customer?.name||'',{placeholder:'Ragione sociale',required:true,maxlength:500});const city=field('Località','city',customer?.city||'',{placeholder:'Città',optional:true,maxlength:500});const address=field('Indirizzo','address',customer?.address||'',{placeholder:'Via e numero civico',optional:true,maxlength:1000});const vat=field('Partita IVA','vat',customer?.vat||'',{placeholder:'Partita IVA',optional:true,maxlength:100});
 form.append(error,customerName.wrap,city.wrap,address.wrap,vat.wrap);
 const actions=el('div',{class:'dialog-actions'});
 if(customer)actions.append(button('Elimina','secondary danger',()=>{
  dialog.close();confirmAction('Eliminare questo cliente?',`${customer.name}. Saranno rimosse anche le sue tariffe. I viaggi già salvati resteranno nel registro.`,async()=>{await persist({...state,customers:state.customers.filter(c=>c.id!==customer.id),tariffs:state.tariffs.filter(t=>t.customerId!==customer.id&&t.client!==customer.name)});render();toast('Cliente eliminato.');});
 }));
 actions.append(el('button',{type:'submit',class:'primary-button','data-save':true},'Salva cliente'));form.append(actions);
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const next=D.upsertCustomer(state,{id:customer?.id,name:customerName.input.value,city:city.input.value,address:address.input.value,vat:vat.input.value});await persist(next);dialog.close();render();toast('Cliente salvato.');}catch(err){error.textContent=err.message;}});body.append(form);customerName.input.focus();
}
function tariffDialog(tariff=null){
 const {dialog,body}=modal(tariff?'Modifica tariffa':'Nuova tariffa',{subtitle:'Scegli cliente e località: l’importo aggiorna automaticamente anche i viaggi già nel registro.'});const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});
 const client=field('Cliente','client',tariff?.client||'',{placeholder:'Seleziona o scrivi il cliente',list:'tariff-customers',required:true,maxlength:500});const city=field('Località','city',tariff?.city||'',{placeholder:'Città del viaggio',required:true,maxlength:500});const amount=field('Trasferta €','cents',moneyInput(tariff?.cents),{placeholder:'0,00',inputmode:'decimal',required:true,maxlength:14});
 client.input.addEventListener('change',()=>autofillCity(client.input,city.input));
 form.append(error,client.wrap,datalist('tariff-customers',state.customers.map(c=>c.name)),city.wrap,amount.wrap,el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),'Salva tariffa'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';try{const next=D.upsertTariff(state,{id:tariff?.id,client:client.input.value,city:city.input.value,cents:D.toCents(amount.input.value)});await persist(next);dialog.close();render();toast('Tariffa, cliente e registro aggiornati.');}catch(err){error.textContent=err.message;}});body.append(form);client.input.focus();
}
function openProfile(required=false){
 const {dialog,body}=modal(required?'Benvenuto a bordo':'Il tuo profilo',{required});
 if(required){body.prepend(el('img',{class:'onboarding-logo',src:'/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo.png',alt:'EFFE.ERRE TRASPORTI'}));body.append(el('div',{class:'onboarding-install','data-install-trigger':true,hidden:isInstalled()},button('Installa app','primary',startInstall,'download',{class:'primary-button full'}),el('p',{},'Porta EFFE.ERRE sulla schermata Home del tuo telefono.')),el('p',{class:'subtitle'},'Inserisci nome e cognome. Compariranno sul tuo resoconto mensile.'));}
 else body.append(el('div',{class:'profile-hero'},el('div',{class:'profile-avatar'},initials()),el('div',{},el('p',{class:'profile-description'},'IL TUO REGISTRO PERSONALE'),el('p',{class:'catalog-title'},name()))));
 const form=el('form',{novalidate:true});const error=el('div',{class:'form-error',role:'alert'});const first=field('Nome','firstName',state.profile.firstName,{placeholder:'Il tuo nome',autocomplete:'given-name',required:true,maxlength:200});const last=field('Cognome','lastName',state.profile.lastName,{placeholder:'Il tuo cognome',autocomplete:'family-name',required:true,maxlength:200});
 form.append(error,first.wrap,last.wrap,el('button',{type:'submit',class:'primary-button full','data-save':true},icon('check'),required?'Inizia a registrare':'Salva profilo'));
 form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';if(!first.input.value.trim()||!last.input.value.trim()){error.textContent='Inserisci nome e cognome dell’autista.';(!first.input.value.trim()?first.input:last.input).focus();return;}try{await persist({...state,profile:{firstName:D.normalizeText(first.input.value),lastName:D.normalizeText(last.input.value)}});dialog.close();render();toast('Profilo salvato.');}catch(err){error.textContent=err.message;}});body.append(form);
 if(!required){
  const importInput=el('input',{type:'file',accept:'.json,.zip,application/json,application/zip',class:'visually-hidden','aria-label':'Seleziona un backup',on:{change:async event=>{const file=event.target.files?.[0];if(!file)return;dialog.close();await importFile(file);}}});
  const installItem=menuButton('Installa app','Aggiungi EFFE.ERRE alla schermata Home.','download',startInstall);installItem.dataset.installTrigger='';installItem.hidden=isInstalled();
  body.append(el('div',{class:'profile-separator'}),el('p',{class:'section-label'},'I tuoi dati'),el('div',{class:'profile-menu'},menuButton('Sincronizza adesso','Invia online le modifiche salvate sul telefono.','cloud',async()=>{try{const result=await store.syncPending();if(result?.state)state=D.validateState(result.state);dialog.close();render();toast('Sincronizzazione completata.');}catch(err){toast(err.message||'Sincronizzazione non riuscita.',true);}}),menuButton('Esporta backup','Salva una copia in File o su Google Drive.','download',()=>downloadBackup()),menuButton('Importa backup','Backup web JSON o archivio Android ZIP.','upload',()=>importInput.click()),menuButton('Ricarica dati online','Recupera la versione online dopo aver conservato un backup.','refresh',()=>{dialog.close();confirmAction('Ricaricare i dati online?','Prima esporta un backup. Le modifiche non sincronizzate sul telefono saranno sostituite dai dati online.',async()=>{const result=await store.loadState({preferRemote:true});state=D.validateState(result.state);user=result.user||null;draft=newDraft();editingId=null;render();toast('Registro online ricaricato.');},'Ricarica');}),installItem,importInput));
  body.append(el('div',{class:'info-note',style:'margin-top:17px;margin-bottom:0'},icon('lock'),'Il PDF mensile contiene viaggi e servizi. Le tariffe e gli importi restano solo nell’app.'));
  body.append(el('p',{class:'subtle-footer'},'Accesso libero, senza password. Il registro è personale per questo browser: conserva un backup prima di cancellare i dati di Safari. Su un altro dispositivo puoi ripristinare il backup.'));
  if(user?.email)body.append(el('p',{class:'subtle-footer'},user.email));
 }
 if(required)first.input.focus();
}
function menuButton(title,description,ico,handler){return el('button',{type:'button',class:'menu-button',on:{click:handler}},icon(ico),el('span',{},title,el('small',{},description)),el('span',{class:'menu-arrow'},'›'));}
function downloadBlob(blob,fileName){const url=URL.createObjectURL(blob);const anchor=el('a',{href:url,download:fileName});document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function downloadBackup(){
 try{
  const text=D.exportBackup(state);const fileName=`EFFE.ERRE-Backup-${today()}.json`;const blob=new Blob([text],{type:'application/json'});const file=new File([blob],fileName,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Backup EFFE.ERRE Registro Viaggi'});}else downloadBlob(blob,fileName);
  toast('Backup pronto. Conservalo in una cartella sicura.');
 }catch(err){if(err.name!=='AbortError')toast(err.message||'Impossibile esportare il backup.',true);}
}
async function importFile(file){
 try{
  if(file.size>32*1024*1024)throw new Error('Il backup supera il limite di 32 MB.');
  let imported;
  if(/\.zip$/i.test(file.name)||file.type==='application/zip'){const module=await import('/LTS-Registro-Viaggi/effeerre/shared/android-backup.mjs');imported=await module.readAndroidBackup(file);}else imported=D.importBackup(await file.text());
  imported=D.validateState(imported);
  confirmAction('Ripristinare il backup?',`Il file contiene ${imported.trips.length} viaggi, ${imported.customers.length} clienti e ${imported.tariffs.length} tariffe. Sostituirà il registro attuale. Prima di continuare conserva una copia dei tuoi dati.`,async()=>{await persist(imported);draft=newDraft();editingId=null;month=state.trips.length?D.sortTrips(state.trips)[0].date.slice(0,7):today().slice(0,7);navigate('register');toast('Backup ripristinato.');if(!state.profile.firstName||!state.profile.lastName)openProfile(true);},'Ripristina');
 }catch(err){toast(err.message||'Il backup non può essere letto.',true);}
}
async function startInstall(){
 if(isInstalled()){toast('EFFE.ERRE è già aperta come app.');return;}
 if(installPrompt){
  const prompt=installPrompt;installPrompt=null;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')return;}catch{}
 }
 installDialog();
}
function installDialog(){
 if(document.querySelector('[data-install-dialog]'))return;
 const apple=isAppleMobile();
 const {dialog,body}=modal('Installa EFFE.ERRE',{subtitle:apple?'Aggiungi il registro alla schermata Home del tuo iPhone.':'Tieni il tuo registro a portata di mano, sulla schermata Home.'});dialog.dataset.installDialog='';
 body.prepend(el('img',{class:'install-app-icon',src:'/LTS-Registro-Viaggi/effeerre/assets/apple-touch-icon.png',alt:'EFFE.ERRE TRASPORTI Registro Viaggi',width:76,height:76}));
 const steps=el('ol',{class:'install-guide'});
 if(apple){
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri questa pagina in Safari'),el('p',{},'Se sei dentro ChatGPT o un’altra app, copia il link qui sotto e incollalo in Safari.'))),el('li',{},el('div',{},el('strong',{},icon('share'),'Tocca Condividi'),el('p',{},'Cerca il quadrato con la freccia verso l’alto. Può essere nel menu di Safari.'))),el('li',{},el('div',{},el('strong',{},'Aggiungi alla schermata Home'),el('p',{},'Se compare “Apri come app web”, attivalo. Poi premi “Aggiungi”.'))));
  body.append(steps,el('div',{class:'info-note'},icon('info'),'La conferma finale si fa nel menu di Safari. Se manca la voce, scorri fino a “Modifica azioni”.'));
 }else{
  steps.append(el('li',{},el('div',{},el('strong',{},'Apri il menu del browser'),el('p',{},'Su telefono cerca il pulsante ⋮ o il menu Condividi.'))),el('li',{},el('div',{},el('strong',{},'Scegli “Installa app”'),el('p',{},'Può chiamarsi anche “Aggiungi alla schermata Home”. Su iPhone usa Condividi in Safari.'))),el('li',{},el('div',{},el('strong',{},'Conferma l’aggiunta'),el('p',{},'Apri EFFE.ERRE dalla nuova icona sul telefono.'))));body.append(steps);
 }
 const manifest=document.querySelector('link[rel="manifest"]');const url=new URL('./',manifest?.href||location.href).href;
 const link=el('input',{type:'url',value:url,readonly:true,'aria-label':'Link dell’app EFFE.ERRE',class:'install-url'});
 const copy=button('Copia link','secondary',async()=>{try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(url);copy.textContent='Link copiato';}catch{link.focus();link.select();toast('Tieni premuto sul link e scegli Copia.');}},'link');
 body.append(el('div',{class:'install-link'},link,copy),button('Torna al registro','text',()=>dialog.close(),null,{class:'text-button full'}));
}
async function initialize(){
 try{
  const result=await store.loadState();state=D.validateState(result?.state||result);user=result?.user||null;
  const subscribe=store.subscribeStatus||store.onStatus;if(subscribe)subscribe(setStatus);
  if(!subscribed&&store.subscribeState){store.subscribeState(receiveState);subscribed=true;}
  if(result?.status)setStatus(result.status);
  render();if(!state.profile.firstName||!state.profile.lastName)openProfile(true);
  if(new URL(location.href).searchParams.get('installa')==='1'&&!isInstalled())installDialog();
 }catch(err){
  root.replaceChildren(el('div',{class:'boot'},el('img',{src:'/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo.png',alt:'EFFE.ERRE TRASPORTI'}),el('div',{class:'boot-error'},el('h2',{},'Il registro non è disponibile'),el('p',{class:'subtitle'},err.message||'Controlla la connessione e riprova.'),button('Riprova','primary',()=>initialize(),'refresh'))));
 }
}
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
initialize();
