/** Audited driver records console. Never stores someone else's archive in localStorage.
 * All actions need a verified admin session/MFA and a server-side revision CAS.
 */
import {SERVICES,formatMoney,toCents} from '../shared/domain.mjs';
import {sharedMapsCustomers} from '../shared-maps-client.mjs';
import {companyFareSnapshot} from '../shared/company-fares.mjs';
import {buildDriverCustomerCatalog} from './driver-customer-catalog.mjs?v=20261107-driver-customer-picker-v1';
const $=id=>document.getElementById(id);
const make=(tag,className='',txt='')=>{
 const e=document.createElement(tag);
 if(className)e.className=className;
 e.textContent=String(txt);
 return e;
};
const money=value=>value===null||value===undefined?'—':formatMoney(value);
const clock=value=>{
 const time=Date.parse(value||'');
 return Number.isFinite(time)?new Date(time).toLocaleString('it-IT'):'—';
};
const tabs=[
 ['trip','Viaggi'],['customer','Clienti personali'],['tariff','Tariffe personali'],
 ['history','Modifiche']
];
const categories={trip:'trips',customer:'customers',tariff:'tariffs'};
const labels={trip:'Viaggio',customer:'Cliente personale',tariff:'Tariffa personale',extra:'Servizio extra'};
const extraLabel=Object.fromEntries(SERVICES.map(x=>[x.key,x.label]));
function field(form,title,name,value='',opts={}){
 const label=make('label','records-field');
 label.append(make('span','',title));
 let el;
 if(opts.kind==='textarea'){
  el=make('textarea');el.rows=opts.rows||3;
 }else{
  el=document.createElement('input');el.type=opts.kind||'text';
  if(opts.maxLength)el.maxLength=opts.maxLength;
  if(opts.inputmode)el.inputMode=opts.inputmode;
 }
 el.name=name;
 if(el.type==='checkbox')el.checked=Boolean(value);
 else el.value=String(value??'');
 if(opts.required)el.required=true;
 if(opts.placeholder)el.placeholder=opts.placeholder;
 label.append(el);form.append(label);
 return el;
}
const euro=cents=>cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',',');
const price=val=>{
 if(!String(val??'').trim())return null;
 return toCents(String(val));
};
const normalizeSearch=value=>String(value??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('it-IT').trim();
function sitePicker(form,{title,client,city,fare}){
 const panel=make('div','records-site-picker');
 panel.append(make('p','records-site-heading',title));
 const label=make('label','records-field records-site-search-label');
 label.append(make('span','','Cerca cliente nell’elenco'));
 const input=document.createElement('input');
 input.type='search';input.autocomplete='off';input.disabled=true;
 input.placeholder='Nome, località o indirizzo';
 const id='records-site-results-'+crypto.randomUUID();
 input.setAttribute('aria-label','Cerca '+title.toLowerCase());
 input.setAttribute('role','combobox');
 input.setAttribute('aria-autocomplete','list');
 input.setAttribute('aria-controls',id);
 input.setAttribute('aria-expanded','false');label.append(input);
 const count=make('p','records-site-count','Caricamento clienti…');
 const results=make('div','records-site-results');results.id=id;results.hidden=true;
 results.setAttribute('role','listbox');results.setAttribute('aria-label','Clienti disponibili');
 const chosen=make('p','records-site-chosen');chosen.hidden=true;
 const hint=make('p','records-site-hint','Caricamento catalogo e tariffe…');
 hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
 panel.append(label,count,results,chosen,hint);form.append(panel);
 const controller=new AbortController(),labels={maps:'Google Maps',company:'Tariffario aziendale',personal:'Cliente autista'};
 let sites=[],rates=[],ratesAvailable=false,ready=false,shown=[],active=-1;
 function close(){results.hidden=true;input.setAttribute('aria-expanded','false');
  input.removeAttribute('aria-activedescendant');active=-1;}
 function pick(site){
  client.value=site.name;city.value=site.city;
  const cents=companyFareSnapshot(rates,ratesAvailable,site.name,site.city);
  fare.value=euro(cents);input.value=site.name+' · '+site.city;
  chosen.textContent=site.name+' · '+site.city+' · '+(labels[site.source]||'Cliente');
  chosen.hidden=false;close();
  hint.classList.toggle('records-site-warning',cents===null);
  hint.textContent=cents===null?
   'Cliente selezionato, tariffa aziendale non disponibile: verifica e inserisci l’importo del viaggio.':
   'Tariffa aziendale applicata: '+money(cents)+'. Salva la modifica per aggiornare il viaggio.';
 }
 function highlight(index){
  if(!shown.length)return;
  active=Math.max(0,Math.min(shown.length-1,index));
  results.querySelectorAll('[role=option]').forEach((option,i)=>{
   option.classList.toggle('is-active',i===active);
   option.setAttribute('aria-selected',String(i===active));
   if(i===active){input.setAttribute('aria-activedescendant',option.id);
    option.scrollIntoView({block:'nearest'});}
  });
 }
 function show(){
  if(!ready)return;
  const words=normalizeSearch(input.value).split(/\s+/u).filter(Boolean);
  const matches=sites.filter(site=>words.every(word=>normalizeSearch(
   [site.name,site.city,site.address,labels[site.source]||''].join(' ')).includes(word)));
  shown=matches.slice(0,words.length?12:8);active=-1;
  results.replaceChildren();
  count.textContent=matches.length+' clienti trovati'+
   (matches.length>shown.length?' · continua a digitare':'');
  if(!matches.length)results.append(make('p','records-site-no-results',
   'Nessuna corrispondenza. Puoi modificare manualmente i campi sottostanti.'));
  for(const [i,site] of shown.entries()){
   const option=make('button','records-site-option');
   option.type='button';option.id=id+'-'+i;
   option.setAttribute('role','option');option.setAttribute('aria-selected','false');
   const body=make('span','records-site-option-body');
   body.append(make('strong','records-site-option-name',site.name),
    make('span','records-site-option-city',site.city));
   if(site.address)body.append(make('span','records-site-option-address',site.address));
   option.append(body,make('span','records-site-option-source',labels[site.source]||'Cliente'));
   option.addEventListener('click',()=>pick(site),{signal:controller.signal});
   results.append(option);
  }
  results.hidden=false;input.setAttribute('aria-expanded','true');
 }
 function catalog(allSites,companyRates,{mapsAvailable=true,tariffsAvailable=true}={}){
  sites=allSites;rates=companyRates;ratesAvailable=tariffsAvailable;ready=true;
  input.disabled=false;input.value='';chosen.hidden=true;close();
  count.textContent=sites.length+' clienti disponibili';
  hint.classList.toggle('records-site-warning',!mapsAvailable||!tariffsAvailable);
  hint.textContent='Cerca tra Google Maps, clienti inseriti nella dashboard e clienti personali dell’autista.'+
   (!mapsAvailable||!tariffsAvailable?' Alcune fonti non sono disponibili: verifica la tariffa.':'');
 }
 input.addEventListener('focus',show,{signal:controller.signal});
 input.addEventListener('input',()=>{chosen.hidden=true;show();},{signal:controller.signal});
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){close();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(results.hidden)show();
   highlight(event.key==='ArrowDown'?active+1:active<0?shown.length-1:active-1);
  }else if(event.key==='Enter'&&!results.hidden&&active>=0&&shown[active]){
   event.preventDefault();pick(shown[active]);
  }
 },{signal:controller.signal});
 document.addEventListener('pointerdown',event=>{
  if(!panel.contains(event.target))close();
 },{signal:controller.signal});
 for(const element of [client,city])element.addEventListener('input',()=>{
  chosen.hidden=true;input.value='';close();fare.value='';
  hint.classList.add('records-site-warning');
  hint.textContent='Cliente o località modificati: controlla la nuova tariffa.';
 },{signal:controller.signal});
 fare.addEventListener('input',()=>{
  hint.classList.remove('records-site-warning');
  hint.textContent='Importo manuale: vale soltanto per questo viaggio.';
 },{signal:controller.signal});
 return {panel,catalog,dispose:()=>controller.abort()};
}
export function setupDriverRecords(account){
 const panel=$('admin-records-panel'),choose=$('records-driver'),
  refresh=$('records-refresh'),status=$('records-status'),
  filter=$('records-search'),list=$('records-list'),
  editor=$('records-editor'),add=$('records-add'),counter=$('records-count'),
  tabsRoot=$('records-tabs');
 let drivers=[],selectedId='',revision=null,state=null,audit=[],
  category='trip',busy=false,loading=false,editing=false,epoch=0,
  desiredPhone='',visibleLimit=35,catalogRequest=0,activePickerDisposers=[],
  editorBaseline='',writeSeq=0;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !$('dashboard').hidden&&$('dashboard').dataset.view==='records';
 const notice=(message,problem=false)=>{
  status.textContent=message;status.classList.toggle('records-error',problem);
 };
 // Only actual form values count as unsaved changes, not search suggestions.
 const formSnapshot=form=>JSON.stringify([...new FormData(form).entries()]);
 function canLeave(){
  if(busy){notice('Salvataggio in corso: attendi prima di cambiare autista o schermata.',true);return false;}
  const form=editor.querySelector('form');
  if(editing&&form&&formSnapshot(form)!==editorBaseline)
   return window.confirm('Ci sono modifiche non salvate. Vuoi davvero abbandonarle?');
  return true;
 }
 function clearEditor(){
  catalogRequest++;activePickerDisposers.splice(0).forEach(dispose=>dispose());
  editor.replaceChildren();editor.hidden=true;editing=false;editorBaseline='';
 }
 function metrics(){
  const counts=state?
   [state.trips.length,state.customers.length,state.tariffs.length]:null;
  for(const [key,value] of [['trips',counts?.[0]],['customers',counts?.[1]],['tariffs',counts?.[2]]])
   $('records-'+key).textContent=value===null||value===undefined?'—':String(value);
  $('records-revision').textContent=revision??'—';
 }
 function reset(){
  epoch++;writeSeq++;drivers=[];selectedId='';revision=null;state=null;audit=[];
  category='trip';busy=false;loading=false;desiredPhone='';visibleLimit=35;
  choose.replaceChildren();list.replaceChildren();clearEditor();filter.value='';
  notice('Seleziona Archivi autisti per caricare gli inserimenti sincronizzati.');
  metrics();counter.textContent='';refresh.disabled=false;choose.disabled=false;
  filter.disabled=false;add.disabled=false;add.hidden=true;
  tabsRoot.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.kind==='trip'));
 }
 function options(){
  choose.replaceChildren();
  for(const driver of drivers){
   const opt=make('option','',driver.name+' · '+(driver.phone||'senza telefono')+
    (driver.status==='removed'?' (rimosso)':''));
   opt.value=driver.id;choose.append(opt);
  }
  if(selectedId&&drivers.some(x=>x.id===selectedId))choose.value=selectedId;
  else if(drivers.length){
   const placeholder=make('option','','Seleziona un autista');
   placeholder.value='';choose.prepend(placeholder);choose.value='';
  }
 }
 function source(){
  if(!state)return [];
  if(category==='extra')return SERVICES.map(x=>({id:x.key,name:x.label,cents:state.extraRates[x.key]}));
  if(category==='history')return audit;
  const raw=state[categories[category]]||[];
  if(category==='trip')return [...raw].sort((a,b)=>b.date.localeCompare(a.date)||
   String(b.createdAt).localeCompare(String(a.createdAt)));
  return [...raw].sort((a,b)=>(a.name||a.client||'').localeCompare(b.name||b.client||'','it'));
 }
 function matches(item,term){
  if(!term)return true;
  const text=category==='trip'?[item.client,item.city,item.container,item.date,item.note]:
   category==='customer'?[item.name,item.city,item.address,item.phone]:
   category==='tariff'?[item.client,item.city]:
   category==='extra'?[item.name]:[item.category,item.action,item.reason,item.recordId,item.at];
  return text.join(' ').toLocaleUpperCase('it-IT').includes(term);
 }
 function summary(item){
  if(category==='trip')return [item.date,item.client+' · '+item.city,
   'Container: '+item.container+' · Trasferta: '+money(item.fareCents),
   item.secondClient?'Seconda presa: '+item.secondClient+' · '+item.secondCity:'',
   item.note?'Note: '+item.note:''].filter(Boolean);
  if(category==='customer')return [item.name,item.city||'Località non indicata',
   item.address||'Indirizzo non disponibile',item.phone?'Telefono: '+item.phone:''].filter(Boolean);
  if(category==='tariff')return [item.client,item.city,'Importo personale (storico): '+money(item.cents)];
  if(category==='extra')return [item.name,'Valore: '+money(item.cents)];
  return [item.action.toUpperCase()+' · '+(labels[item.category]||item.category),
   clock(item.at)+' · '+item.recordId,
   'Revisioni: '+item.beforeRevision+' → '+item.afterRevision,
   item.reason?'Motivo: '+item.reason:''].filter(Boolean);
 }
 function render({keepEditor=false}={}){
  metrics();if(!keepEditor)clearEditor();
  const values=source(),term=filter.value.trim().toLocaleUpperCase('it-IT');
  const matched=values.filter(item=>matches(item,term));
  list.replaceChildren();counter.textContent=matched.length+' elementi visualizzabili';
  add.hidden=!state||!['trip','customer'].includes(category);
  add.textContent=category==='trip'?'Aggiungi viaggio':'Nuovo cliente personale';
  if(!state){
   list.append(make('p','records-empty','Nessun archivio sincronizzato. Il telefono dell’autista deve effettuare il primo invio online.'));
   return;
  }
  if(!matched.length){list.append(make('p','records-empty','Nessun elemento corrisponde alla ricerca.'));return;}
  for(const item of matched.slice(0,visibleLimit)){
   const card=make('article','records-card');
   const body=make('div','records-card-text');
   const lines=summary(item);
   lines.forEach((t,i)=>body.append(make(i===0?'h3':'p',i===0?'records-card-title':'',t)));
   const actions=make('div','records-card-actions');
   if(category==='history'){
    if(item.action==='delete'){
     const btn=make('button','button outline small','Ripristina');
     btn.type='button';btn.addEventListener('click',()=>void restore(item));
     actions.append(btn);
    }
   }else{
    const edit=make('button','button outline small','Modifica');
    edit.type='button';
    edit.setAttribute('aria-label','Modifica '+(labels[category]||'inserimento')+' '+summary(item)[0]);
    edit.addEventListener('click',()=>openEditor(item));
    actions.append(edit);
    if(category!=='extra'){
     const remove=make('button','button outline small records-danger','Elimina');
     remove.type='button';remove.addEventListener('click',()=>void remove(item));
     actions.append(remove);
    }
   }
   card.append(body,actions);list.append(card);
  }
  if(matched.length>visibleLimit){
   const more=make('button','button outline records-more',
    'Mostra altri '+(matched.length-visibleLimit)+' elementi');
   more.type='button';more.addEventListener('click',()=>{visibleLimit+=35;render({keepEditor:true});});
   list.append(more);
  }
 }
 async function load({silent=false}={}){
  if(!authorized()||busy||loading||(silent&&editing))return false;
  if(editing&&!canLeave())return false;
  if(editing)clearEditor();
  const token=++epoch;loading=true;refresh.disabled=true;
  if(!silent)notice('Aggiornamento archivi degli autisti…');
  try{
   const results=await account.adminRecords('list');
   if(token!==epoch||!authorized())return false;
   if(!Array.isArray(results?.drivers))throw new Error('Elenco autisti non valido.');
   // Ignore a list refresh started before the user opened an editor.
   if(silent&&editing)return false;
   drivers=results.drivers;
   if(desiredPhone){
    const requested=desiredPhone;
    desiredPhone='';
    const found=drivers.find(x=>x.phone===requested);
    if(!found){
     selectedId='';state=null;revision=null;audit=[];options();render();
     notice('L’autista selezionato non risulta tra gli archivi autorizzati. Nessun altro archivio è stato aperto.',true);
     return false;
    }
    selectedId=found.id;
   }
   if(!selectedId&&!choose.options.length)selectedId=drivers[0]?.id||'';
   if(selectedId&&!drivers.some(x=>x.id===selectedId))selectedId=drivers[0]?.id||'';
   if(!selectedId&&drivers.length)selectedId=drivers[0].id;
   options();
   if(selectedId)await readSelected({silent,token});
   else{state=null;revision=null;render();notice('Non ci sono archivi autisti disponibili.');}
   return true;
  }catch(error){
   if(token===epoch)notice(error?.message||'Archivi non disponibili.',true);
   return false;
  }finally{if(token===epoch){loading=false;refresh.disabled=false;}}
 }
 async function readSelected({silent=false,token=epoch}={}){
  if(!selectedId||!authorized())return;
  const id=selectedId;
  const result=await account.adminRecords('read',{driverId:id});
  if(token!==epoch||selectedId!==id||!authorized())return;
  // Ignore a stale background read while a user is editing an archive.
  if(silent&&editing)return;
  const record=result?.archive;
  if(record!==null&&record!==undefined&&!Array.isArray(record?.state?.trips))
   throw new Error('Archivio non valido: aggiornamento interrotto.');
  const changed=!silent||revision!==record?.revision||JSON.stringify(audit)!==JSON.stringify(result.audit);
  state=record?.state||null;revision=record?.revision??null;audit=result.audit||[];
  if(changed)render();
  const driver=drivers.find(x=>x.id===id);
  notice((driver?.name||'Autista')+' · '+(record?
    'archivio sincronizzato, revisione '+revision+
    '. Ultimo salvataggio: '+clock(record.updatedAt):
    'nessun archivio online. Le modifiche saranno disponibili dopo la prima sincronizzazione.'));
 }
 async function selectDriver(){
  if(!authorized()||!canLeave()){choose.value=selectedId;return;}
  // Invalidate an older driver read/list, including its loading state.
  const target=choose.value,token=++epoch;
  loading=false;refresh.disabled=false;
  selectedId=target;revision=null;state=null;audit=[];filter.value='';
  visibleLimit=35;clearEditor();render();
  loading=true;refresh.disabled=true;
  notice('Caricamento dell’archivio selezionato…');
  try{await readSelected({token});}
  catch(error){if(token===epoch)notice(error.message,true);}
  finally{if(token===epoch){loading=false;refresh.disabled=false;}}
 }
 function openEditor(item=null){
  if(!authorized()||busy||!state||!canLeave())return;
  clearEditor();
  const kind=category;
  if(!['trip','customer','tariff','extra'].includes(kind))return;
  const catalogToken=++catalogRequest,driverAtOpen=selectedId;
  editing=true;editor.hidden=false;editor.replaceChildren();
  const form=make('form','records-edit-form');
  const title=make('h3','',item?'Modifica '+(labels[kind]||'elemento'):
   kind==='trip'?'Aggiungi viaggio all’autista':'Nuovo cliente personale');
  form.append(title);
  const note=make('p','records-editor-note',
   'La modifica viene registrata nell’audit amministrativo e sincronizzata sul registro dell’autista.');
  form.append(note);
  const values=item||{};
  let serviceBoxes=[],pickers=[];
  if(kind==='customer'){
   const owner=drivers.find(driver=>driver.id===selectedId);
   form.append(make('p','records-private-note',
    'Cliente personale di '+(owner?.name||'questo autista')+
    '. Le correzioni saranno sincronizzate soltanto con il suo archivio. Il cliente non verrà aggiunto alla lista aziendale condivisa.'));
  }
  if(kind==='trip'){
   field(form,'Data','date',values.date||new Date().toISOString().slice(0,10),{kind:'date',required:true});
   const client=field(form,'Cliente','client',values.client||'',{required:true,maxLength:500});
   const city=field(form,'Località','city',values.city||'',{required:true,maxLength:500});
   field(form,'Container','container',values.container||'',{required:true,maxLength:500});
   const fare=field(form,'Tariffa del viaggio (€)','fareCents',euro(values.fareCents),{inputmode:'decimal',
    placeholder:'Vuoto = tariffa da completare'});
   const primaryPicker=sitePicker(form,{title:'Cliente principale',client,city,fare});
   form.insertBefore(primaryPicker.panel,client.parentElement);
   pickers.push(primaryPicker);activePickerDisposers.push(primaryPicker.dispose);
   const secondClient=field(form,'Cliente seconda presa','secondClient',values.secondClient||'');
   const secondCity=field(form,'Località seconda presa','secondCity',values.secondCity||'');
   const secondFare=field(form,'Tariffa seconda presa (€)','secondFareCents',euro(values.secondFareCents),
    {inputmode:'decimal'});
   const secondPicker=sitePicker(form,{title:'Cliente seconda presa',client:secondClient,city:secondCity,
    fare:secondFare});
   form.insertBefore(secondPicker.panel,secondClient.parentElement);
   pickers.push(secondPicker);activePickerDisposers.push(secondPicker.dispose);
   field(form,'Somma le due prese','sumPickupFares',values.sumPickupFares!==false,
    {kind:'checkbox'});
   const section=make('fieldset','records-services');
   section.append(make('legend','','Servizi extra del viaggio'));
   for(const srv of SERVICES){
    const row=make('div','records-service-row');
    const box=document.createElement('input');box.type='checkbox';box.name='service:'+srv.key;
    box.checked=(values.services||[]).includes(srv.key);
    const label=make('label','',srv.label);label.prepend(box);
    const rate=document.createElement('input');rate.type='text';rate.name='rate:'+srv.key;
    rate.inputMode='decimal';rate.placeholder='Importo € (facoltativo)';
    rate.value=euro(values.extraCents?.[srv.key]);
    rate.setAttribute('aria-label','Importo '+srv.label);
    row.append(label,rate);section.append(row);serviceBoxes.push({key:srv.key,box,rate});
   }
   form.append(section);
   field(form,'Note del viaggio','note',values.note||'',{kind:'textarea',maxLength:2000});
  }else if(kind==='customer'){
   field(form,'Nome cliente','name',values.name||'',{required:true,maxLength:500});
   field(form,'Località','city',values.city||'',{maxLength:500});
   field(form,'Via e indirizzo','address',values.address||'',{maxLength:1000});
   field(form,'Telefono','phone',values.phone||'',{kind:'tel',maxLength:40});
   field(form,'Partita IVA','vat',values.vat||'',{maxLength:100});
  }else if(kind==='tariff'){
   form.append(make('p','records-editor-note',
    values.client+' · '+values.city+' — tariffa personale storica, distinta dal listino comune.'));
   field(form,'Importo personale (€)','cents',euro(values.cents),
    {inputmode:'decimal',required:true});
  }else if(kind==='extra'){
   form.append(make('p','records-editor-note',values.name));
   field(form,'Importo servizio (€)','cents',euro(values.cents),
    {inputmode:'decimal',placeholder:'Vuoto = non configurato'});
  }
  field(form,'Motivo della modifica (audit)','reason','',{maxLength:500,
   placeholder:'Esempio: correzione su richiesta dell’autista'});
  const buttons=make('div','records-form-actions');
  const submit=make('button','button primary','Salva modifica');
  submit.type='submit';buttons.append(submit);
  const cancelButton=make('button','button outline','Annulla');cancelButton.type='button';
  cancelButton.addEventListener('click',()=>{if(canLeave())clearEditor();});buttons.append(cancelButton);form.append(buttons);
  form.addEventListener('submit',event=>{
   event.preventDefault();
   const input=name=>form.elements.namedItem(name);
   const patch={};
   try{
    if(kind==='trip'){
     for(const field of ['date','client','city','container','secondClient','secondCity','note'])
      patch[field]=input(field).value;
     patch.fareCents=price(input('fareCents').value);
     patch.secondFareCents=price(input('secondFareCents').value);
     patch.sumPickupFares=input('sumPickupFares').checked;
     patch.services=serviceBoxes.filter(x=>x.box.checked).map(x=>x.key);
     patch.extraCents=Object.fromEntries(serviceBoxes.map(x=>[x.key,price(x.rate.value)]));
    }else if(kind==='customer'){
     for(const field of ['name','city','address','phone','vat'])patch[field]=input(field).value;
    }else patch.cents=price(input('cents').value);
    if(kind==='tariff'&&patch.cents===null)throw new Error('Inserisci un importo.');
   }catch(error){notice(error.message,true);return;}
   void mutate({operation:item?'update':'create',category:kind,
    recordId:item?.id||crypto.randomUUID(),patch,reason:input('reason').value});
  });
  editor.append(form);editorBaseline=formSnapshot(form);
  editor.scrollIntoView({block:'start',behavior:'smooth'});
  if(kind==='trip'){
   const personalCustomers=Array.isArray(state?.customers)?state.customers:[];
   void Promise.allSettled([sharedMapsCustomers(),account.companyTariffs('list')]).then(results=>{
    if(catalogToken!==catalogRequest||driverAtOpen!==selectedId||!authorized()||
       !editor.contains(form))return;
    const mapsAvailable=results[0].status==='fulfilled'&&Array.isArray(results[0].value);
    const tariffsAvailable=results[1].status==='fulfilled'&&Array.isArray(results[1].value?.tariffs);
    const customers=mapsAvailable?results[0].value:[];
    const tariffs=tariffsAvailable?results[1].value.tariffs:[];
    const combined=buildDriverCustomerCatalog({
     sharedSites:customers,companyRates:tariffs,personalCustomers
    });
    pickers.forEach(p=>p.catalog(combined,tariffs,{mapsAvailable,tariffsAvailable}));
   }).catch(()=>{
    if(catalogToken!==catalogRequest||!editor.contains(form))return;
    const combined=buildDriverCustomerCatalog({personalCustomers});
    pickers.forEach(p=>p.catalog(combined,[],{mapsAvailable:false,tariffsAvailable:false}));
   });
  }
  form.querySelector('input:not([type=checkbox])')?.focus({preventScroll:true});
 }
 async function mutate({operation,category:kind,recordId,patch={},reason='',auditId=null}){
  if(busy||!authorized()||!state||revision===null)return false;
  const owner=selectedId,token=epoch,expectedRevision=revision,write=++writeSeq;
  busy=true;refresh.disabled=true;
  const navigation=[choose,filter,add,...tabsRoot.querySelectorAll('button')];
  const navigationDisabled=navigation.map(node=>node.disabled);
  navigation.forEach(node=>{node.disabled=true;});
  const controls=[...editor.querySelectorAll('button,input,textarea,select')];
  const previousDisabled=controls.map(control=>control.disabled);
  controls.forEach(control=>{control.disabled=true;});
  notice('Registrazione della modifica in corso…');
  try{
   const r=await account.adminRecords('mutate',{
    driverId:owner,expectedRevision,requestId:crypto.randomUUID(),
    operation,category:kind,recordId,patch,reason,...(auditId?{auditId}:{})
   });
   if(!Number.isSafeInteger(r?.revision)||!r?.state||!Array.isArray(r.audit))
    throw new Error('Salvataggio non confermato: aggiorna il registro.');
   if(token!==epoch||owner!==selectedId||!authorized())return false;
   revision=r.revision;state=r.state;audit=r.audit;
   render();notice('Modifica salvata online (revisione '+revision+
    '). L’autista la vedrà al prossimo aggiornamento online; lo storico rimane nell’audit.');
   return true;
  }catch(error){
   if(write===writeSeq&&token===epoch&&owner===selectedId){
    notice(error?.message||'Salvataggio non riuscito.',true);
    controls.forEach((control,index)=>{control.disabled=previousDisabled[index];});
   }
   // Never replace the user's edited form after a 409 conflict.
   return false;
  }finally{
   if(write===writeSeq){
    busy=false;refresh.disabled=false;
    navigation.forEach((node,index)=>{node.disabled=navigationDisabled[index];});
   }
  }
 }
 async function remove(item){
  if(!authorized()||!canLeave())return;
  const name=summary(item)[0];
  if(!window.confirm('Eliminare '+(labels[category]||'elemento')+' · '+name+
   '? La rimozione verrà tracciata e potrà essere ripristinata. I viaggi storici non vengono cancellati quando elimini un cliente.'))return;
  const reason=window.prompt('Motivo della rimozione (almeno 8 caratteri):','');
  if(reason===null)return;
  if(reason.trim().length<8){notice('Inserisci almeno 8 caratteri per motivare la rimozione.',true);return;}
  if(editing)clearEditor();
  await mutate({operation:'delete',category,recordId:item.id,reason:reason.trim()});
 }
 async function restore(entry){
  if(!authorized()||!canLeave()||
     !window.confirm('Ripristinare questo elemento dall’audit? Non verranno sovrascritti eventuali elementi con lo stesso ID.'))return;
  if(editing)clearEditor();
  await mutate({operation:'restore',category:entry.category,
   recordId:entry.recordId,auditId:entry.id,reason:'Ripristino da storico amministrativo'});
 }
 function setCategory(next){
  if(!tabs.some(x=>x[0]===next)||busy||next===category)return;
  if(!canLeave())return;
  category=next;filter.value='';visibleLimit=35;
  tabsRoot.querySelectorAll('button').forEach(b=>{
   const selected=b.dataset.kind===category;
   b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
  });
  render();
 }
 function openForPhone(phone='',kind='trip'){
  if(!canLeave())return false;
  // Invalidate old list/read and release its loading state before the new fetch.
  epoch++;loading=false;refresh.disabled=false;clearEditor();
  choose.replaceChildren(); // Old roster options must never point at the wrong driver.
  desiredPhone=typeof phone==='string'?phone:'';
  selectedId='';state=null;revision=null;audit=[];visibleLimit=35;
  filter.value='';category='';setCategory(kind==='customer'?'customer':'trip');
  list.replaceChildren();metrics();void load();
  return true;
 }
 choose.addEventListener('change',()=>void selectDriver());
 refresh.addEventListener('click',()=>void load());
 filter.addEventListener('input',()=>{visibleLimit=35;render({keepEditor:true});});
 add.addEventListener('click',()=>openEditor());

 for(const [key,label] of tabs){
  const b=make('button','records-tab'+(key===category?' selected':''),label);
  b.type='button';b.dataset.kind=key;b.setAttribute('aria-pressed',String(key===category));
  b.addEventListener('click',()=>setCategory(key));tabsRoot.append(b);
 }
 reset();
 return {load,reset,openForPhone,canLeave,refreshActive(){
  if(busy||loading||editing||document.activeElement?.matches?.('input,select,textarea'))return false;
  void load({silent:true});return true;
 }};
}
