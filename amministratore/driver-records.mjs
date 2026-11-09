/** Audited driver records console. Never stores someone else's archive in localStorage.
 * All actions need a verified admin session/MFA and a server-side revision CAS.
 */
import {SERVICES,formatMoney,toCents,buildTripAmountContext,tripAmounts,saturdayAllowanceStatus} from '../shared/domain.mjs';
import {sharedMapsCustomers} from '../shared-maps-client.mjs';
import {companyFareSnapshot} from '../shared/company-fares.mjs';
import {buildDriverCustomerCatalog,filterDriverCustomerCatalog} from './driver-customer-catalog.mjs?v=20261109-personal-company-v1';
import {attachPersonalCustomerCertification} from './personal-customer-maps-ui.mjs?v=20261108-certify-v1';
import {RECORD_FILTERS,assessPersonalCustomer,archiveCustomerMetrics,
 customerMatchesQuickFilter,tripWorklistSummary,archiveMatchesSearch,archivedRestoreStatus}
 from './records-intelligence.mjs?v=20261108-rc3-v1';
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
function sitePicker(form,{title,client,city,fare,keepFare=false}){
 const panel=make('div','records-site-picker');
 panel.append(make('p','records-site-heading',title));
 const scopeBar=make('div','records-site-scopes');
 scopeBar.setAttribute('role','group');
 scopeBar.setAttribute('aria-label','Origine dei clienti');
 const modes=[['shared','Condivisi'],['personal','Personali autista'],['all','Tutti']];
 const buttons=new Map();
 let scope='shared';
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
 count.setAttribute('role','status');
 const results=make('div','records-site-results');results.id=id;results.hidden=true;
 results.setAttribute('role','listbox');results.setAttribute('aria-label','Clienti disponibili');
 const chosen=make('p','records-site-chosen');chosen.hidden=true;
 const applyFare=make('button','button outline records-site-apply-fare');
 applyFare.type='button';applyFare.hidden=true;
 const hint=make('p','records-site-hint','Caricamento catalogo e tariffe…');
 hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
 panel.append(scopeBar,label,count,results,chosen,applyFare,hint);form.append(panel);
 const controller=new AbortController();
 const labels={maps:'Google Maps condiviso',company:'Cliente aziendale condiviso',personal:'Cliente autista'};
 let sites=[],rates=[],ratesAvailable=false,ready=false,shown=[],active=-1,suggestedCents=null;
 function close(){
  results.hidden=true;input.setAttribute('aria-expanded','false');
  input.removeAttribute('aria-activedescendant');active=-1;
 }
 function pick(site){
  client.value=site.name;city.value=site.city;
  const cents=companyFareSnapshot(rates,ratesAvailable,site.name,site.city);
  suggestedCents=cents;
  if(!keepFare&&cents!==null&&!fare.value.trim())fare.value=euro(cents);
  input.value=site.name+' · '+site.city;
  chosen.textContent='Selezionato: '+site.name+' · '+site.city+
   (site.address?' · '+site.address:'')+' ('+(labels[site.source]||'Cliente')+')';
  chosen.hidden=false;close();
  const preserved=keepFare;
  applyFare.hidden=cents===null;
  applyFare.textContent=cents===null?'':('Applica tariffa aziendale: '+money(cents));
  hint.classList.toggle('records-site-warning',cents===null);
  hint.textContent=cents===null?
   'Cliente selezionato: tariffa aziendale non disponibile. L’importo registrato resta invariato, verifica se è corretto.':
   preserved?
   'Cliente e località aggiornati. La tariffa storica del viaggio NON è stata cambiata. Puoi applicare esplicitamente il nuovo importo.':
   'Cliente selezionato. Controlla la tariffa prima di salvare il viaggio.';
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
  const matches=filterDriverCustomerCatalog(sites,{scope,query:input.value});
  shown=matches.slice(0,input.value.trim()?15:10);active=-1;
  results.replaceChildren();
  const type=scope==='shared'?'condivisi':scope==='personal'?'personali':'totali';
  count.textContent=matches.length+' clienti '+type+' trovati'+
   (matches.length>shown.length?' · continua a digitare':'');
  if(!matches.length)results.append(make('p','records-site-no-results',
   scope==='shared'?'Nessun cliente condiviso trovato. Prova un altro nome o località.':
   'Nessun cliente trovato. Puoi modificare manualmente i campi sottostanti.'));
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
 function setScope(next){
  if(!modes.some(([mode])=>mode===next))return;
  scope=next;
  for(const [mode,button] of buttons){
   button.classList.toggle('selected',mode===scope);
   button.setAttribute('aria-pressed',String(mode===scope));
  }
  if(ready)show();
 }
 for(const [mode,text] of modes){
  const button=make('button','records-site-scope',text);
  button.type='button';button.setAttribute('aria-pressed',String(mode===scope));
  button.addEventListener('click',()=>setScope(mode),{signal:controller.signal});
  scopeBar.append(button);buttons.set(mode,button);
 }
 setScope('shared');
 function catalog(allSites,companyRates,{mapsAvailable=true,tariffsAvailable=true}={}){
  sites=Array.isArray(allSites)?allSites:[];rates=companyRates;
  ratesAvailable=tariffsAvailable;ready=true;
  input.disabled=false;input.value='';chosen.hidden=true;applyFare.hidden=true;close();
  const shared=filterDriverCustomerCatalog(sites,{scope:'shared'}).length;
  const personal=filterDriverCustomerCatalog(sites,{scope:'personal'}).length;
  count.textContent=shared+' clienti condivisi · '+personal+' personali disponibili';
  hint.classList.toggle('records-site-warning',!mapsAvailable||!tariffsAvailable);
  hint.textContent='Scegli «Condivisi» per sostituire il cliente del viaggio con uno aziendale.'+
   (keepFare?' La tariffa già registrata rimane invariata fino a una tua scelta.':'')+
   (!mapsAvailable||!tariffsAvailable?' Alcune fonti non sono disponibili, controlla l’elenco e la tariffa.':'');
 }
 input.addEventListener('focus',show,{signal:controller.signal});
 input.addEventListener('input',()=>{chosen.hidden=true;applyFare.hidden=true;show();},{signal:controller.signal});
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
 applyFare.addEventListener('click',()=>{
  if(suggestedCents===null)return;
  fare.value=euro(suggestedCents);
  applyFare.hidden=true;
  hint.classList.remove('records-site-warning');
  hint.textContent='Tariffa aziendale '+money(suggestedCents)+' applicata solo a questo viaggio. Salva per confermare.';
 },{signal:controller.signal});
 for(const element of [client,city])element.addEventListener('input',()=>{
  chosen.hidden=true;input.value='';close();applyFare.hidden=true;suggestedCents=null;
  if(!keepFare)fare.value='';
  hint.classList.add('records-site-warning');
  hint.textContent='Cliente o località modificati: controlla la tariffa prima di salvare.';
 },{signal:controller.signal});
 fare.addEventListener('input',()=>{
  applyFare.hidden=true;
  hint.classList.remove('records-site-warning');
  hint.textContent='Importo manuale: vale soltanto per questo viaggio.';
 },{signal:controller.signal});
 return {panel,catalog,dispose:()=>controller.abort()};
}


/** Replace a private driver's customer identity using a verified company
 * directory entry. This edits ONLY that private record on explicit submit:
 * it does not migrate old trips, delete records or create shared customers.
 */
function personalCompanyPicker(form,{name,city,address,phone,vat,isDuplicate,linkedRates=0}){
 const panel=make('section','records-site-picker records-company-picker');
 panel.setAttribute('aria-label','Sostituisci con cliente aziendale');
 panel.append(make('h4','records-site-heading','Sostituisci con cliente aziendale'));
 panel.append(make('p','records-editor-note',
  'Scegli un cliente condiviso per compilare nome, località e indirizzo del cliente personale. '+
  'I viaggi passati non cambiano; la scheda resta nell’archivio personale dell’autista. '+
  'Telefono e partita IVA del precedente cliente saranno svuotati: controllali prima di salvare.'));
 let ratesAcknowledged=null;
 if(linkedRates>0){
  const ack=make('label','records-private-rate-ack');
  ratesAcknowledged=document.createElement('input');
  ratesAcknowledged.type='checkbox';
  ratesAcknowledged.name='confirmLinkedPersonalRates';
  ack.append(ratesAcknowledged,make('span','',
   'Questa scheda ha '+linkedRates+' tariffa/e personali collegate. '+
   'Confermo che il nome di queste tariffe seguirà il nuovo cliente, ma gli importi non cambieranno.'));
  panel.append(ack);
 }
 const label=make('label','records-field records-site-search-label');
 label.append(make('span','','Cerca nell’elenco condiviso (nome, città o indirizzo)'));
 const input=document.createElement('input');
 input.type='search';input.autocomplete='off';input.disabled=true;
 input.placeholder='Cerca cliente aziendale…';
 input.setAttribute('aria-label','Cerca un cliente condiviso da sostituire');
 input.setAttribute('role','combobox');
 input.setAttribute('aria-autocomplete','list');
 const id='records-company-results-'+crypto.randomUUID();
 input.setAttribute('aria-controls',id);
 input.setAttribute('aria-expanded','false');
 label.append(input);
 const count=make('p','records-site-count','Caricamento clienti aziendali…');
 const results=make('div','records-site-results');
 results.id=id;results.hidden=true;results.setAttribute('role','listbox');
 results.setAttribute('aria-label','Clienti aziendali condivisi');
 const chosen=make('p','records-site-chosen');chosen.hidden=true;
 const hint=make('p','records-site-hint','In attesa del catalogo condiviso.');
 hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
 panel.append(label,count,results,chosen,hint);
 form.append(panel);
 const controller=new AbortController();
 let ready=false,sites=[],shown=[],active=-1;
 function close(){
  results.hidden=true;input.setAttribute('aria-expanded','false');
  input.removeAttribute('aria-activedescendant');active=-1;
 }
 function pick(site){
  if(!site||site.source==='personal')return;
  if(ratesAcknowledged&&!ratesAcknowledged.checked){
   hint.textContent='Conferma prima il trasferimento del nome delle tariffe personali collegate.';
   hint.classList.add('records-site-warning');return;
  }
  if(String(site.name).length>500||String(site.city).length>500||
     String(site.address||'').length>1000){
   hint.textContent='Dati aziendali troppo lunghi: verifica il cliente prima di sostituirlo.';
   hint.classList.add('records-site-warning');return;
  }
  if(isDuplicate(site.name)){
   hint.textContent='Un altro cliente personale ha già questo nome. Verifica i duplicati prima di sostituirlo.';
   hint.classList.add('records-site-warning');return;
  }
  name.value=site.name;city.value=site.city;
  address.value=site.address||'';
  phone.value='';vat.value='';
  input.value=site.name+' · '+site.city;
  chosen.textContent='Cliente aziendale selezionato: '+site.name+' · '+site.city+
   (site.address?' · '+site.address:'')+'. Conferma con «Salva modifica».';
  chosen.hidden=false;
  hint.classList.remove('records-site-warning');
  hint.textContent='Scheda personale compilata dal condiviso. Contatti precedenti svuotati. '+
   'Controlla i campi e salva; i viaggi storici non vengono modificati.';
  close();
 }
 function highlight(index){
  if(!shown.length)return;
  active=Math.max(0,Math.min(shown.length-1,index));
  results.querySelectorAll('[role=option]').forEach((option,i)=>{
   option.classList.toggle('is-active',i===active);
   option.setAttribute('aria-selected',String(i===active));
   if(i===active){
    input.setAttribute('aria-activedescendant',option.id);
    option.scrollIntoView({block:'nearest'});
   }
  });
 }
 function show(){
  if(!ready)return;
  const matches=filterDriverCustomerCatalog(sites,{scope:'shared',query:input.value});
  shown=matches.slice(0,input.value.trim()?15:10);
  active=-1;results.replaceChildren();
  count.textContent=matches.length+' clienti aziendali trovati'+
   (matches.length>shown.length?' · continua a digitare':'');
  if(!matches.length)results.append(make('p','records-site-no-results',
   'Nessun cliente condiviso corrispondente. Prova un altro nome o località.'));
  for(const [i,site] of shown.entries()){
   const button=make('button','records-site-option');
   button.type='button';button.id=id+'-'+i;
   button.setAttribute('role','option');button.setAttribute('aria-selected','false');
   const body=make('span','records-site-option-body');
   body.append(make('strong','records-site-option-name',site.name),
    make('span','records-site-option-city',site.city));
   if(site.address)body.append(make('span','records-site-option-address',site.address));
   button.append(body,make('span','records-site-option-source',
    site.source==='maps'?'Google Maps':'Cliente condiviso'));
   button.addEventListener('click',()=>pick(site),{signal:controller.signal});
   results.append(button);
  }
  results.hidden=false;input.setAttribute('aria-expanded','true');
 }
 function catalog(entries,{mapsAvailable=true,tariffsAvailable=true}={}){
  sites=filterDriverCustomerCatalog(entries,{scope:'shared'});
  ready=true;input.disabled=sites.length===0;
  count.textContent=sites.length+' clienti aziendali disponibili';
  hint.classList.toggle('records-site-warning',!mapsAvailable||!tariffsAvailable||!sites.length);
  hint.textContent=sites.length?
   'Cerca e seleziona il cliente aziendale da usare per questa scheda personale.'+
   (!mapsAvailable||!tariffsAvailable?' Alcune fonti non sono disponibili.':''):
   'Elenco aziendale non disponibile: nessuna sostituzione automatica possibile.';
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
 for(const field of [name,city,address,phone,vat]){
  field.addEventListener('input',()=>{chosen.hidden=true;},{signal:controller.signal});
 }
 return {panel,catalog,dispose:()=>controller.abort()};
}

export function setupDriverRecords(account){
 const panel=$('admin-records-panel'),choose=$('records-driver'),
  refresh=$('records-refresh'),status=$('records-status'),
  filter=$('records-search'),list=$('records-list'),
  editor=$('records-editor'),add=$('records-add'),counter=$('records-count'),
  tabsRoot=$('records-tabs'),worklist=$('records-worklist'),
  quickBar=$('records-quick-filters'),quality=$('records-data-quality'),
  sharedStatus=$('records-shared-status'),worklistSubtitle=$('records-worklist-subtitle'),
  worklistPrimary=$('records-worklist-primary');
 let drivers=[],selectedId='',revision=null,state=null,audit=[],
  category='trip',busy=false,loading=false,editing=false,epoch=0,
  desiredPhone='',visibleLimit=35,catalogRequest=0,activePickerDisposers=[],
  editorBaseline='',writeSeq=0,quickFilter='all',sharedSites=null,
  sharedLoading=false,sharedSeq=0,sharedCheckedAt='',sharedError=false,
  cachedSources=new Map(),cachedTripSummary=null,cachedAmountContext=null,
  cachedCustomerMetrics=null,cachedCustomerShared=null;
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

 function worklistUI(trips=null){
  const supported=category==='customer'||category==='trip';
  worklist.hidden=!supported;
  if(!supported)return;
  const choices=RECORD_FILTERS[category];
  if(!choices.some(opt=>opt.key===quickFilter))quickFilter='all';
  quickBar.replaceChildren();
  for(const opt of choices){
   const btn=make('button','records-quick-filter'+(quickFilter===opt.key?' selected':''),opt.label);
   btn.type='button';btn.setAttribute('aria-pressed',String(opt.key===quickFilter));
   btn.disabled=category==='customer'&&['possible','shared'].includes(opt.key)&&!Array.isArray(sharedSites);
   btn.addEventListener('click',()=>{
    if(!authorized()||busy||btn.disabled)return;
    quickFilter=opt.key;visibleLimit=35;render({keepEditor:true});
   });
   quickBar.append(btn);
  }
  quality.replaceChildren();
  const metric=(label,num,explain)=>{
   const item=make('div','records-quality-item');
   item.append(make('span','',label),make('strong','',num===null||num===undefined?'—':String(num)));
   item.append(make('small','',explain));quality.append(item);
  };
  if(category==='customer'){
   const m=state?customerMetrics():null;
   metric('Indirizzo mancante',m?.missing,'Anagrafiche da completare');
   metric('Possibili duplicati',m?.possible,'Da verificare, mai eliminati da soli');
   metric('Già nel condiviso',m?.shared,'Corrispondenza di nome, città e via');
   worklistPrimary.textContent=m?m.review+' da controllare':'—';
   worklistSubtitle.textContent='Confronta i clienti personali con le sedi condivise senza modificare i viaggi.';
   sharedStatus.hidden=false;
   sharedStatus.textContent=sharedLoading?'Verifica dell’elenco condiviso in corso…':
    sharedSites?(sharedError?'Verifica condiviso non riuscita: ultimo controllo alle ':
      'Elenco condiviso verificato alle ')+sharedCheckedAt+
      '. Le corrispondenze non eliminano automaticamente i clienti.':
    'Elenco condiviso non verificato. I filtri sui duplicati saranno disponibili dopo il controllo.';
  }else{
   const m=trips||(state?(cachedTripSummary??=tripWorklistSummary(state.trips)):null);
   metric('Viaggi registrati',m?.total,'Archivio selezionato');
   metric('Importi incompleti',m?.incomplete,'Tariffe o extra da completare');
   worklistPrimary.textContent=m?m.incomplete+' da completare':'—';
   worklistSubtitle.textContent='Trova i viaggi che richiedono importi, senza ricalcolare i dati storici.';
   sharedStatus.hidden=true;
  }
 }
 async function refreshShared(){
  if(!authorized()||category!=='customer'||!state||!selectedId)return;
  const token=++sharedSeq,owner=selectedId,instance=epoch;
  sharedLoading=true;sharedError=false;worklistUI();
  try{
   const results=await sharedMapsCustomers();
   if(token!==sharedSeq||instance!==epoch||owner!==selectedId||category!=='customer'||!authorized())return;
   sharedSites=results;
   sharedCheckedAt=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
   sharedError=false;
  }catch(error){
   if(token!==sharedSeq||instance!==epoch||owner!==selectedId||category!=='customer'||!authorized())return;
   sharedError=true;
   if(!sharedSites)notice('Archivio personale disponibile. Elenco condiviso non verificato: '+
    (error?.message||'Controlla la connessione.'),true);
  }finally{
   if(token===sharedSeq&&instance===epoch&&owner===selectedId&&category==='customer'&&authorized()){
    sharedLoading=false;
    if(list.querySelector('.records-delete-confirm'))worklistUI();
    else render({keepEditor:true});
   }
  }
 }
 function invalidateDerived(){
  cachedSources.clear();cachedTripSummary=null;cachedAmountContext=null;
  cachedCustomerMetrics=null;cachedCustomerShared=null;
 }
 function customerMetrics(){
  if(!state)return null;
  if(!cachedCustomerMetrics||cachedCustomerShared!==sharedSites){
   cachedCustomerMetrics=archiveCustomerMetrics(state.customers,sharedSites);
   cachedCustomerShared=sharedSites;
  }
  return cachedCustomerMetrics;
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
  invalidateDerived();
  category='trip';busy=false;loading=false;desiredPhone='';visibleLimit=35;
  sharedSeq++;sharedSites=null;sharedCheckedAt='';sharedLoading=false;sharedError=false;quickFilter='all';
  choose.replaceChildren();list.replaceChildren();clearEditor();filter.value='';
  notice('Seleziona Archivi autisti per caricare gli inserimenti sincronizzati.');
  metrics();worklistUI();counter.textContent='';refresh.disabled=false;choose.disabled=false;
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
  if(cachedSources.has(category))return cachedSources.get(category);
  let data;
  if(category==='extra')data=SERVICES.map(x=>({id:x.key,name:x.label,cents:state.extraRates[x.key]}));
  else if(category==='history')data=audit;
  else{
   const raw=state[categories[category]]||[];
   data=category==='trip'?[...raw].sort((a,b)=>b.date.localeCompare(a.date)||
    String(b.createdAt).localeCompare(String(a.createdAt))):
    [...raw].sort((a,b)=>(a.name||a.client||'').localeCompare(b.name||b.client||'','it'));
  }
  cachedSources.set(category,data);return data;
 }
 function matches(item,term){return archiveMatchesSearch(item,category,term);}
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

 function tripCardBody(item,amountContext){
  const amounts=tripAmounts(item,amountContext);
  const saturday=saturdayAllowanceStatus(item,amountContext);
  const body=make('div','records-card-text');
  body.append(make('h3','records-card-title',item.date));
  body.append(make('p','records-trip-route',item.client+' · '+item.city));
  const details=make('div','records-trip-details');
  const row=(label,value)=>{
   const element=make('div','records-trip-detail');
   element.append(make('strong','',label),make('span','',value));
   details.append(element);
  };
  row('Container',item.container||'—');
  row('Trasferta',money(item.fareCents));
  if(item.secondClient){
   row('Seconda presa',item.secondClient+' · '+item.secondCity);
   if(item.sumPickupFares!==false)row('Seconda trasferta',money(item.secondFareCents));
   else row('Seconda trasferta','Non sommata');
  }
  if(item.services?.length){
   row('Extra',money(amounts.extraCents));
   const services=make('div','records-trip-services');
   for(const service of SERVICES.filter(s=>item.services.includes(s.key))){
    const entry=make('div','records-trip-service');
    const value=service.key==='sabatoTrasferta'&&saturday.status==='included'
     ? 'Già conteggiato su un altro viaggio della data'
     : money(item.extraCents?.[service.key]);
    entry.append(make('span','',service.label),make('span','',value));
    services.append(entry);
   }
   details.append(services);
  }else row('Extra','Nessuno');
  if(item.note)details.append(make('p','records-trip-note','Note: '+item.note));
  body.append(details);
  const total=make('div','records-trip-total');
  total.append(make('span','',amounts.missingTariff?'Totale parziale':'Totale'),make('strong','',money(amounts.totalCents)));
  body.append(total);
  if(amounts.missingTariff)body.append(make('p','records-trip-warning','Una o più tariffe non sono impostate: il totale visualizzato è parziale.'));
  if(saturday.status==='included')body.append(make('p','records-trip-warning','SABATO TRASFERTA conteggiato una sola volta per questa data.'));
  return body;
 }
 function render({keepEditor=false}={}){
  metrics();if(!keepEditor)clearEditor();
  const tripSummary=category==='trip'&&state?(cachedTripSummary??=tripWorklistSummary(state.trips)):null;
  worklistUI(tripSummary);
  const values=source(),term=filter.value.trim();
  const matched=values.filter(item=>matches(item,term)&&(
   category==='customer'?customerMatchesQuickFilter(item,quickFilter,sharedSites):
   category==='trip'&&quickFilter==='incomplete'?tripSummary?.incompleteIds.has(String(item.id)):
   true));
  list.replaceChildren();counter.textContent=matched.length+' elementi visualizzabili su '+values.length;
  add.hidden=!state||!['trip','customer'].includes(category);
  add.textContent=category==='trip'?'Aggiungi viaggio':'Nuovo cliente personale';
  if(!state){
   list.append(make('p','records-empty','Nessun archivio sincronizzato. Il telefono dell’autista deve effettuare il primo invio online.'));
   return;
  }
  if(!matched.length){list.append(make('p','records-empty','Nessun elemento corrisponde alla ricerca.'));return;}
  const amountContext=category==='trip'?(cachedAmountContext??=buildTripAmountContext(state.trips)):null;
  for(const item of matched.slice(0,visibleLimit)){
   const card=make('article',category==='trip'?'records-card records-trip-card':'records-card');
   const body=category==='trip'?tripCardBody(item,amountContext):make('div','records-card-text');
   if(category==='customer'){
    card.classList.add('records-customer-card');
    const assessment=assessPersonalCustomer(item,sharedSites);
    body.append(make('h3','records-card-title',item.name));
    const meta=make('div','records-customer-meta');
    meta.append(make('p','records-customer-city',item.city||'Località non indicata'));
    meta.append(make('span','records-customer-badge is-'+assessment.status,assessment.label));
    body.append(meta);
    body.append(make('p','records-customer-address',item.address||'Indirizzo non disponibile'));
    const extra=make('details','records-customer-details');
    extra.append(make('summary','','Altri dati'));
    if(item.phone)extra.append(make('p','','Telefono: '+item.phone));
    if(item.vat)extra.append(make('p','','Partita IVA: '+item.vat));
    if(!item.phone&&!item.vat)extra.append(make('p','','Nessun altro dato personale registrato.'));
    body.append(extra);
   }else if(category!=='trip'){
    const lines=summary(item);
    lines.forEach((t,i)=>body.append(make(i===0?'h3':'p',i===0?'records-card-title':'',t)));
   }
   const actions=make('div','records-card-actions');
   if(category==='history'){
    if(item.action==='delete'){
     const availability=archivedRestoreStatus(item,audit,state);
     if(availability.eligible){
      const btn=make('button','button outline small','Ripristina');
      btn.type='button';btn.addEventListener('click',()=>void restore(item));
      actions.append(btn);
     }else{
      const info=make('span','records-restore-status',availability.label);
      info.setAttribute('role','status');
      actions.append(info);
     }
    }
   }else{
    const edit=make('button','button outline small','Modifica');
    edit.type='button';
    edit.setAttribute('aria-label','Modifica '+(labels[category]||'inserimento')+' '+summary(item)[0]);
    edit.addEventListener('click',()=>openEditor(item));
    actions.append(edit);
    if(category==='customer'){
     const certify=make('button','button outline small records-card-certify','Certifica Maps');
     certify.type='button';
     certify.setAttribute('aria-label','Certifica con Google Maps '+item.name+' · '+item.city);
     certify.addEventListener('click',()=>openEditor(item,{focusCertification:true}));
     actions.append(certify);
    }
    if(category!=='extra'){
     const remove=make('button','button outline small records-danger','Elimina');
     remove.type='button';remove.addEventListener('click',()=>openDeleteConfirmation(item,card,actions));
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
  invalidateDerived();
  if(changed)render();
  if(category==='customer')void refreshShared();
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
  selectedId=target;revision=null;state=null;audit=[];invalidateDerived();filter.value='';
  sharedSeq++;sharedSites=null;sharedCheckedAt='';sharedError=false;sharedLoading=false;quickFilter='all';
  visibleLimit=35;clearEditor();render();
  loading=true;refresh.disabled=true;
  notice('Caricamento dell’archivio selezionato…');
  try{await readSelected({token});}
  catch(error){if(token===epoch)notice(error.message,true);}
  finally{if(token===epoch){loading=false;refresh.disabled=false;}}
 }
 function openEditor(item=null,{focusCertification=false}={}){
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
  let serviceBoxes=[],pickers=[],companyPicker=null;
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
   const primaryPicker=sitePicker(form,{title:'Cliente principale',client,city,fare,keepFare:Boolean(item)});
   form.insertBefore(primaryPicker.panel,client.parentElement);
   pickers.push(primaryPicker);activePickerDisposers.push(primaryPicker.dispose);
   const secondClient=field(form,'Cliente seconda presa','secondClient',values.secondClient||'');
   const secondCity=field(form,'Località seconda presa','secondCity',values.secondCity||'');
   const secondFare=field(form,'Tariffa seconda presa (€)','secondFareCents',euro(values.secondFareCents),
    {inputmode:'decimal'});
   const secondPicker=sitePicker(form,{title:'Cliente seconda presa',client:secondClient,city:secondCity,
    fare:secondFare,keepFare:Boolean(item)});
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
   const name=field(form,'Nome cliente','name',values.name||'',{required:true,maxLength:500});
   const city=field(form,'Località','city',values.city||'',{maxLength:500});
   const address=field(form,'Via e indirizzo','address',values.address||'',{maxLength:1000});
   const phone=field(form,'Telefono','phone',values.phone||'',{kind:'tel',maxLength:40});
   const vat=field(form,'Partita IVA','vat',values.vat||'',{maxLength:100});
   if(item){
    companyPicker=personalCompanyPicker(form,{name,city,address,phone,vat,
     isDuplicate:next=>state.customers.some(row=>row.id!==item.id&&
      normalizeSearch(row.name)===normalizeSearch(next)),
     linkedRates:state.tariffs.filter(row=>row.customerId===item.id).length});
    form.insertBefore(companyPicker.panel,name.parentElement);
    activePickerDisposers.push(companyPicker.dispose);
   }
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
  if(kind==='customer'&&item){
   const customerOwner=selectedId,accountOwner=account.getAccountId(),openEpoch=epoch;
   const certification=attachPersonalCustomerCertification({
    form,customer:item,
    isActive:()=>authorized()&&!busy&&!loading&&
     account.getAccountId()===accountOwner&&selectedId===customerOwner&&
     epoch===openEpoch&&category==='customer'&&editor.contains(form),
    isUnchanged:()=>formSnapshot(form)===editorBaseline,
    currentCustomers:()=>Array.isArray(state?.customers)?state.customers:[],
    removePersonal:reason=>mutate({operation:'delete',category:'customer',
     recordId:item.id,reason}),
    notice
   });
   activePickerDisposers.push(certification.dispose);
  }
  editor.scrollIntoView({block:'start',behavior:'smooth'});
  if(kind==='trip'||(kind==='customer'&&companyPicker)){
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
    if(companyPicker)companyPicker.catalog(combined,{mapsAvailable,tariffsAvailable});
    else pickers.forEach(p=>p.catalog(combined,tariffs,{mapsAvailable,tariffsAvailable}));
   }).catch(()=>{
    if(catalogToken!==catalogRequest||!editor.contains(form))return;
    const combined=buildDriverCustomerCatalog({personalCustomers});
    if(companyPicker)companyPicker.catalog(combined,{mapsAvailable:false,tariffsAvailable:false});
    else pickers.forEach(p=>p.catalog(combined,[],{mapsAvailable:false,tariffsAvailable:false}));
   });
  }
  if(focusCertification&&kind==='customer'&&item){
   const section=editor.querySelector('.records-certify-panel');
   section?.scrollIntoView({block:'center',behavior:'smooth'});
   section?.querySelector('input[type=url]')?.focus({preventScroll:true});
  }else form.querySelector('input:not([type=checkbox])')?.focus({preventScroll:true});
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
   revision=r.revision;state=r.state;audit=r.audit;invalidateDerived();
   render();
   if(kind==='customer'&&category==='customer')void refreshShared();
   notice('Modifica salvata online (revisione '+revision+
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

 // Inline confirmation avoids browser prompt/confirm dialogs, which may be
 // suppressed by mobile browsers and installed PWAs. No write occurs until
 // the administrator explicitly submits a valid reason.
 function openDeleteConfirmation(item,card,actions){
  if(!authorized()){
   notice('Sessione amministratore non verificata: accedi di nuovo prima di eliminare.',true);
   const info=make('p','records-delete-error','Accesso non autorizzato. Verifica la sessione amministratore.');
   card.querySelector('.records-delete-error')?.remove();
   card.insertBefore(info,actions);return;
  }
  if(busy||!canLeave()){
   const info=make('p','records-delete-error','Operazione non disponibile mentre è in corso un salvataggio o ci sono modifiche non confermate.');
   card.querySelector('.records-delete-error')?.remove();
   card.insertBefore(info,actions);return;
  }
  if(!state||revision===null){
   const info=make('p','records-delete-error','Archivio non disponibile. Premi Aggiorna archivio e riprova.');
   card.querySelector('.records-delete-error')?.remove();
   card.insertBefore(info,actions);return;
  }
  // Only one deletion panel can be open at a time.
  for(const pending of list.querySelectorAll('.records-delete-confirm')){
   const parent=pending.parentElement;
   pending.remove();
   parent?.querySelector('.records-card-actions')?.removeAttribute('hidden');
  }
  for(const info of list.querySelectorAll('.records-delete-error'))info.remove();
  const kind=category,owner=selectedId,recordId=item.id;
  const name=summary(item)[0];
  const form=make('form','records-delete-confirm');
  form.noValidate=true;
  form.setAttribute('aria-label','Conferma eliminazione '+(labels[kind]||'elemento'));
  form.append(make('h4','records-delete-title','Conferma eliminazione'));
  form.append(make('p','records-delete-explainer','Stai eliminando '+(labels[kind]||'elemento')+
   ' · '+name+'. La rimozione sarà registrata nello storico e potrà essere ripristinata. I viaggi già registrati non vengono cancellati eliminando un cliente.'));
  const label=make('label','records-delete-label');
  label.append(make('span','','Motivo della rimozione (almeno 8 caratteri)'));
  const reason=make('textarea','records-delete-reason');
  reason.name='reason';reason.rows=2;reason.maxLength=500;reason.minLength=8;
  reason.required=true;reason.placeholder='Es. Cliente duplicato o inserimento errato';
  label.append(reason);form.append(label);
  const error=make('p','records-delete-error');
  error.setAttribute('role','alert');error.hidden=true;
  form.append(error);
  const buttons=make('div','records-delete-actions');
  const cancel=make('button','button outline','Annulla');cancel.type='button';
  const confirm=make('button','button records-delete-submit','Conferma eliminazione');
  confirm.type='submit';
  buttons.append(cancel,confirm);form.append(buttons);
  const close=()=>{
   if(busy)return;
   form.remove();actions.hidden=false;
  };
  cancel.addEventListener('click',close);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(busy)return;
   const text=reason.value.trim();
   if(text.length<8){
    error.textContent='Scrivi una motivazione di almeno 8 caratteri.';
    error.hidden=false;reason.focus();return;
   }
   if(owner!==selectedId||kind!==category||!authorized()){
    error.textContent='Il contesto dell’archivio è cambiato. Riapri il cliente e riprova.';
    error.hidden=false;return;
   }
   confirm.disabled=true;cancel.disabled=true;reason.disabled=true;
   error.hidden=true;
   const success=await mutate({operation:'delete',category:kind,recordId,reason:text});
   if(!success&&form.isConnected){
    reason.disabled=false;confirm.disabled=false;cancel.disabled=false;
    error.textContent=status.textContent||'Eliminazione non riuscita. Verifica la connessione e riprova.';
    error.hidden=false;
   }
  });
  card.insertBefore(form,actions);
  actions.hidden=true;
  reason.focus({preventScroll:true});
  form.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function restore(entry){
  if(!authorized()||!canLeave())return;
  const availability=archivedRestoreStatus(entry,audit,state);
  if(!availability.eligible){
   notice(availability.label+'. Aggiorna lo storico prima di riprovare.',true);
   render({keepEditor:true});return;
  }
  if(!window.confirm('Ripristinare questo elemento dall’audit? Non verranno sovrascritti eventuali elementi con lo stesso ID.'))return;
  if(editing)clearEditor();
  await mutate({operation:'restore',category:entry.category,
   recordId:entry.recordId,auditId:entry.id,reason:'Ripristino da storico amministrativo'});
 }
 function setCategory(next){
  if(!tabs.some(x=>x[0]===next)||busy||next===category)return;
  if(!canLeave())return;
  if(category==='customer'&&next!=='customer'){sharedSeq++;sharedLoading=false;}
  category=next;filter.value='';quickFilter='all';visibleLimit=35;
  tabsRoot.querySelectorAll('button').forEach(b=>{
   const selected=b.dataset.kind===category;
   b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
  });
  render();
  if(category==='customer'&&state)void refreshShared();
 }
 function openForPhone(phone='',kind='trip'){
  if(!canLeave())return false;
  // Invalidate old list/read and release its loading state before the new fetch.
  epoch++;loading=false;refresh.disabled=false;clearEditor();
  choose.replaceChildren(); // Old roster options must never point at the wrong driver.
  desiredPhone=typeof phone==='string'?phone:'';
  selectedId='';state=null;revision=null;audit=[];invalidateDerived();visibleLimit=35;
  sharedSeq++;sharedSites=null;sharedCheckedAt='';sharedError=false;sharedLoading=false;quickFilter='all';
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
