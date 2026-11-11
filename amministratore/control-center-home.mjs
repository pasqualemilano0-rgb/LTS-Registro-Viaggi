/** Administrative Home. Read-only views over existing, MFA-protected APIs. */
import {ADMIN_ACTIONS,normalizeActionPreferences,deriveControlCenter,searchAuthorized,
 isCalendarDay,romeDate} from './control-center-model.mjs?v=20261111-control-center-v1';

const byId=id=>document.getElementById(id);
const text=(tag,cls='',value='')=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(value);return n;};
const money=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n/100):'—';
const dateLabel=value=>isCalendarDay(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Data non disponibile';
const monthLabel=value=>/^\d{4}-(0[1-9]|1[0-2])$/u.test(value||'')?new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')).replace(/^./u,letter=>letter.toLocaleUpperCase('it-IT')):'Mese selezionato';
const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(d):null;};
const shift=(day,offset)=>new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
const endMonth=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
const paths={
 home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
 users:'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 truck:'M1 3h14v13H1zM15 8h4l3 4v4h-7M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 archive:'M3 3h18v4H3zM5 7v14h14V7M10 11h4',clients:'M21 21H3V3h12v18M15 9h6v12M6 7h5M6 11h5M6 15h5',
 wallet:'M21 8V5H3v15h18V8Zm0 3h-6v5h6M17 13.5h.01',pin:'M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 chart:'M3 3v18h18M7 16v-4M12 16V7M17 16v-7',alert:'m12 3 10 18H2L12 3ZM12 9v4M12 17h.01',
 download:'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',
 search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2',
 sliders:'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',arrow:'M4 12h16m-6-6 6 6-6 6',calendar:'M3 5h18v16H3zM16 3v4M8 3v4M3 11h18',check:'m5 12 4 4L19 6'
};
function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',width:24,height:24,fill:'none',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,String(v));const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.home);svg.append(p);return svg;}
function button(label,handler,cls='cc-quick-action'){const b=text('button',cls,label);b.type='button';if(handler)b.addEventListener('click',handler);return b;}
function safeSignature(value){try{return JSON.stringify(value);}catch{return null;}}
const svgNode=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
const noop=()=>{};

export function setupControlCenter({account,authorized=()=>false,getRoster=()=>null,getReport=()=>null,
 getCustomers=()=>null,getApprovals=()=>null,openView=noop,openTrip=noop,openCustomer=noop,
 openApprovals=noop,setReportFilters=noop}={}){
 const host=byId('control-center-home'),dashboard=byId('dashboard');
 if(!host||!dashboard)return {refresh:noop,reset:noop,openCustomers:noop};
 const nodes={},signatures=new Map(),requests=new Map();
 let owner=null,insights=null,insightQuery=null,insightKey=null,desiredKey=null,requestSeq=0,queue=false,selectedTrendDay=29;
 let loadedReportStamp=null,lastFetchAt=0,error='',loading=false,preferences=normalizeActionPreferences();
 let model=deriveControlCenter(),mounted=false,changingFilters=false;
 const originalToday=()=>romeDate()||new Date().toISOString().slice(0,10);
 const ownerId=()=>typeof account?.getAccountId==='function'?account.getAccountId():null;
 const verified=()=>account?.isVerified?.()===true&&account?.getRole?.()==='admin';
 const permitted=()=>verified()&&authorized()&&!dashboard.hidden&&!dashboard.inert&&!document.hidden;
 const atHome=()=>dashboard.dataset.view==='overview'&&!['customers','approvals'].includes(dashboard.dataset.homeSection);
 const canAct=()=>permitted()&&atHome();
 function act(handler){return ()=>{if(canAct())handler();};}
 function prefsKey(){return 'lts-control-center-actions-v1:'+encodeURIComponent(owner||'');}
 function readPreferences(){try{return normalizeActionPreferences(JSON.parse(localStorage.getItem(prefsKey())||'null'));}catch{return normalizeActionPreferences();}}
 function savePreferences(){preferences=normalizeActionPreferences(preferences);try{localStorage.setItem(prefsKey(),JSON.stringify(preferences));}catch{}renderActions();}
 function patch(id,data,render){const s=safeSignature(data);if(signatures.get(id)===s)return;signatures.set(id,s);render();}
 function field(label,id,type='text'){
  const wrapper=text('label','cc-filter',label),input=document.createElement(type==='select'?'select':'input');input.id=id;
  if(type!=='select')input.type=type;wrapper.htmlFor=id;wrapper.append(input);nodes[id]=input;return wrapper;
 }
 function section(title,subtitle,id,kind='section'){
  const root=text(kind,'cc-chart-card');if(id)root.id=id;
  const head=text('div','cc-section-head'),copy=text('div');copy.append(text('h2','cc-card-title',title));
  if(subtitle)copy.append(text('p','cc-chart-caption',subtitle));head.append(copy);root.append(head);return root;
 }
 function listSection(title,id,subtitle){const root=section(title,subtitle,null);const list=text('div','cc-operation-list');list.id=id;nodes[id]=list;root.append(list);return root;}
 function mount(){
  if(mounted)return;mounted=true;host.classList.add('cc-home-layout');host.setAttribute('aria-label','LTS Control Center');
  const hero=text('header','cc-hero'),avatar=text('span','cc-avatar','LTS');avatar.setAttribute('aria-hidden','true');
  const intro=text('div','cc-hero-copy');intro.append(text('p','cc-eyebrow','LTS CONTROL CENTER'),text('h1','','Bentornato, amministratore'),text('p','cc-subtitle','Le attività aziendali, in un unico punto.'));intro.querySelector('h1').id='cc-home-title';
  const tools=text('div','cc-hero-tools');nodes.sync=text('p','cc-sync','In attesa dei dati autorizzati');nodes.sync.setAttribute('role','status');
  const refreshButton=button('Aggiorna dati',act(()=>refresh({force:true})),'cc-hero-refresh');refreshButton.id='cc-refresh';refreshButton.prepend(icon('refresh'));tools.append(nodes.sync,refreshButton);hero.append(avatar,intro,tools);host.append(hero);
  const toolbar=text('section','cc-toolbar');toolbar.setAttribute('aria-label','Ricerca e filtri aziendali');
  const searchWrap=text('label','cc-global-search');searchWrap.htmlFor='cc-global-search';searchWrap.append(icon('search'),text('span','cc-search-label','Cerca nell’azienda'));
  const search=document.createElement('input');search.id='cc-global-search';search.type='search';search.maxLength=120;search.autocomplete='off';search.placeholder='Autista, cliente, container, località…';search.setAttribute('aria-controls','cc-search-results');searchWrap.append(search);nodes.search=search;
  nodes.searchResults=text('div','cc-search-results');nodes.searchResults.id='cc-search-results';nodes.searchResults.hidden=true;
  toolbar.append(searchWrap,nodes.searchResults);
  const filters=document.createElement('form');filters.className='cc-filters';filters.setAttribute('aria-label','Filtri della Home');
  filters.append(field('Mese','cc-month','month'),field('Dal','cc-from','date'),field('Al','cc-to','date'),field('Autista','cc-driver','select'),field('Cliente','cc-client','select'),field('Località','cc-city','select'));
  const apply=button('Applica filtri',null,'button primary');apply.id='cc-apply';apply.type='submit';
  const clear=button('Ripristina',act(()=>{setDefaultFilters();applyFilters();}),'button outline');clear.id='cc-reset-filters';filters.append(apply,clear);
  filters.addEventListener('submit',e=>{e.preventDefault();if(canAct())applyFilters();});
  nodes['cc-month'].addEventListener('change',()=>{const m=nodes['cc-month'].value;if(!/^\d{4}-\d{2}$/u.test(m))return;nodes['cc-from'].value=m+'-01';nodes['cc-to'].value=m===originalToday().slice(0,7)?originalToday():endMonth(m);});
  nodes.error=text('p','cc-error');nodes.error.setAttribute('role','alert');nodes.error.hidden=true;
  nodes.status=text('p','cc-status-note','Statistiche calcolate sui dati sincronizzati e autorizzati.');nodes.status.setAttribute('role','status');toolbar.append(filters,nodes.error,nodes.status);
  const kpis=text('section','cc-kpis');kpis.setAttribute('aria-label','Indicatori aziendali');
  const specifications=[['driversTotal','Autisti totali','users','sky',()=>route('drivers',{status:'all'})],['driversActive','Autisti attivi','users','teal',()=>route('drivers',{status:'active'})],['tripsToday','Viaggi oggi','calendar','petrol',()=>route('trips',{month:originalToday().slice(0,7),driverId:getReport()?.driverId||null,fromDate:originalToday(),toDate:originalToday(),client:'',city:'',container:''})],['tripsMonth','Viaggi del mese','truck','sky',()=>route('trips',monthlyScope())],['faresMonthCents','Valore tariffe del mese','wallet','teal',()=>route('analysis',monthlyScope())],['companyCustomers','Clienti aziendali','clients','violet',()=>openCustomers()],['anomalies','Anomalie da controllare','alert','amber',()=>route('alerts',shownQuery())],['pendingApprovals','Approvazioni in sospeso','pin','petrol',()=>openApprovals(null)]];
  nodes.kpis={};
  for(const [id,label,kind,tone,handler]of specifications){const card=button('',act(handler),'cc-kpi');card.id='cc-kpi-'+id;card.dataset.tone=tone;const top=text('span','cc-kpi-top');top.append(icon(kind),text('span','cc-kpi-label',label));const value=text('strong','cc-kpi-value','—'),hint=text('span','cc-kpi-hint','In attesa dei dati');card.append(top,value,hint);nodes.kpis[id]={card,value,hint};kpis.append(card);}
  host.append(kpis,text('p','cc-value-note','Valori delle tariffe registrate nei viaggi: non sono fatture emesse o importi incassati.'),toolbar);
  const quick=section('Azioni rapide','Scegli le attività da tenere a portata di mano.');quick.classList.add('cc-quick');
  const editor=document.createElement('details');editor.id='cc-customize-actions';editor.className='cc-action-editor';editor.append(text('summary','','Personalizza azioni'));nodes.editorBody=text('div','cc-action-editor-body');editor.append(nodes.editorBody);quick.append(editor);nodes.actions=text('div','cc-quick-grid');nodes.actions.id='cc-quick-actions';quick.append(nodes.actions);host.append(quick);
  const charts=text('section','cc-chart-grid');charts.setAttribute('aria-label','Grafici interattivi');
  const chartSpecs=[['daily','Viaggi negli ultimi 30 giorni','Tocca un giorno per aprire i viaggi registrati.'],['drivers','Viaggi per autista','Dati del periodo e dei filtri selezionati.'],['monthly','Confronto tra mesi','Mesi completi: si applica il filtro autista, non cliente o località.'],['client-values','Valore tariffe per cliente','Somma degli importi registrati nel periodo selezionato.'],['clients','Clienti più utilizzati','Numero di viaggi nel periodo selezionato.'],['cities','Località più frequenti','Numero di viaggi nel periodo selezionato.'],['anomalies','Anomalie e dati incompleti','Segnalazioni restituite dal sistema, da verificare.']];
  for(const [id,title,subtitle]of chartSpecs){const box=section(title,subtitle,null);box.dataset.chart=id;const content=text('div',id==='daily'?'cc-day-chart':'cc-chart-bars');content.id='cc-chart-'+id;nodes[content.id]=content;box.append(content);charts.append(box);}host.append(charts);
  const operations=text('section','cc-operations');operations.setAttribute('aria-label','Centro operativo');
  operations.append(listSection('Ultimi viaggi','cc-recent-trips','Apri il singolo inserimento per controllarne i dettagli.'),listSection('Richieste clienti','cc-pending-approvals','Proposte in attesa della verifica amministrativa.'),listSection('Da verificare','cc-alerts','Anomalie e archivi segnalati dal sistema.'),listSection('Ultimi aggiornamenti','cc-company-updates','Date di aggiornamento presenti nei record caricati.'));
  host.append(operations);search.addEventListener('input',renderSearch);setDefaultFilters();renderActions();
 }
 function setDefaultFilters(){const today=originalToday();nodes['cc-month'].value=today.slice(0,7);nodes['cc-from'].value=shift(today,-29);nodes['cc-to'].value=today;for(const idof of ['cc-driver','cc-client','cc-city'])nodes[idof].value='';changingFilters=false;}
 function query(){return {month:nodes['cc-month'].value,driverId:nodes['cc-driver'].value||null,fromDate:nodes['cc-from'].value,toDate:nodes['cc-to'].value,client:nodes['cc-client'].value||'',city:nodes['cc-city'].value||'',container:''};}
 function monthlyScope(){const value=getReport()||query();return {month:value.month,driverId:value.driverId||null,fromDate:value.month+'-01',toDate:endMonth(value.month),client:'',city:'',container:''};}
 function validateQuery(value){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/u.test(value.month)||!isCalendarDay(value.fromDate)||!isCalendarDay(value.toDate)||value.fromDate>value.toDate)throw Error('Controlla il mese e le date del periodo.');
  const earliest=new Date(Date.UTC(Number(value.month.slice(0,4)),Number(value.month.slice(5,7))-12,1)).toISOString().slice(0,10);
  if(value.fromDate<earliest||value.toDate>endMonth(value.month)||Date.parse(value.toDate)-Date.parse(value.fromDate)>366*86400000)throw Error('Scegli un periodo entro i dodici mesi disponibili, senza superare il mese selezionato.');
  for(const field of ['client','city'])if(value[field].length>100)throw Error('Il filtro del servizio accetta fino a 100 caratteri. Per i nomi più lunghi usa la ricerca aziendale.');
 }
 function applyFilters(){
  if(!canAct())return;
  let value;try{value=query();validateQuery(value);}catch(err){error=err.message;renderStatus();return;}
  changingFilters=true;error='';
  setReportFilters({month:value.month,driverId:value.driverId});
  void loadInsights({force:true});renderSnapshots();
 }
 function route(view,filters={}){if(canAct())openView(view,filters);}
 function openCustomers(){if(canAct())openView('customers',{});}
 function applyShownFilters(overrides){const next={...shownQuery(),...overrides};nodes['cc-month'].value=next.month;nodes['cc-from'].value=next.fromDate;nodes['cc-to'].value=next.toDate;for(const [id,key]of [['cc-driver','driverId'],['cc-client','client'],['cc-city','city']])selectValue(id,next[key]||'');applyFilters();}
 function selectValue(id,value){const select=nodes[id];if(![...select.options].some(o=>o.value===value)){const option=text('option','',value);option.value=value;select.append(option);}select.value=value;}
 function action(id){
  if(id==='customers')return openCustomers();
  if(id==='approvals')return openApprovals(null);
  route(id,query());
 }
 function renderActions(){
  const selected=new Map(ADMIN_ACTIONS.map(x=>[x.id,x]));
  nodes.actions.replaceChildren();nodes.editorBody.replaceChildren();
  for(const [index,id]of preferences.order.entries()){
   const item=selected.get(id);if(!item)continue;
   if(!preferences.hidden.includes(id)){const b=button('',act(()=>action(id)));b.dataset.action=id;b.dataset.quickAction=id;b.append(icon(item.icon),text('span','',item.label),icon('arrow'));nodes.actions.append(b);}
   const row=text('div','cc-action-editor-row');row.dataset.editorAction=id;
   const label=text('label','cc-action-toggle'),input=document.createElement('input');input.type='checkbox';input.checked=!preferences.hidden.includes(id);input.dataset.actionVisible=id;input.setAttribute('aria-label','Mostra '+item.label);label.append(input,text('span','',item.label));
   input.addEventListener('change',()=>{if(!canAct())return;preferences.hidden=input.checked?preferences.hidden.filter(x=>x!==id):[...preferences.hidden,id];savePreferences();nodes.editorBody.querySelector('[data-action-visible="'+id+'"]')?.focus();});
   row.append(label);
   for(const [direction,delta,labelText]of [['up',-1,'Sposta prima'],['down',1,'Sposta dopo']]){const move=button(delta<0?'↑':'↓',act(()=>{const order=preferences.order.slice(),next=index+delta;if(next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];preferences.order=order;savePreferences();nodes.editorBody.querySelector('[data-editor-action="'+id+'"] [data-action-move="'+direction+'"]')?.focus();}),'cc-action-move');move.dataset.actionMove=direction;move.setAttribute('aria-label',labelText+' '+item.label);move.disabled=index+delta<0||index+delta>=preferences.order.length;row.append(move);}nodes.editorBody.append(row);
  }
 }
 function snapshot(){
  const r=getReport();const value=query();
  const matched=r&&r.month===value.month&&(r.driverId===undefined||String(r.driverId||'')===String(value.driverId||''));
  return {roster:getRoster(),report:matched?r:null,insights:insights,customerStats:getCustomers(),approvals:getApprovals(),today:originalToday()};
 }
 function renderStatus(){
  nodes.error.textContent=error;nodes.error.hidden=!error;host.setAttribute('aria-busy',String(loading));
  const monthlyStale=getReport()?.stale===true;
  const seen=stamp(model.insightsReportedAt||model.reportedAt);
  nodes.sync.textContent=loading?'Aggiornamento discreto in corso…':error?'Ultimi dati confermati conservati':monthlyStale?'Riepilogo mensile da aggiornare':seen?'Dati verificati · '+seen:'Dati autorizzati in caricamento';
  nodes.sync.dataset.state=loading?'loading':error||monthlyStale?'stale':seen?'ready':'loading';
  const prior=showingPreviousScope(),shown=shownQuery();
  const range='dal '+dateLabel(shown.fromDate)+' al '+dateLabel(shown.toDate);
  const filterNames=[shown.driverId?model.options.drivers.find(d=>d.id===shown.driverId)?.name||'Autista selezionato':'Tutti gli autisti',shown.client||'Tutti i clienti',shown.city||'Tutte le località'].join(' · ');
  nodes.status.textContent=prior?'I nuovi filtri non sono ancora confermati. Sono mostrati gli ultimi dati verificati '+range+' · '+filterNames+'.':loading?'Aggiornamento delle analisi, senza interrompere la schermata.':model.scope.recordsComplete?'Analisi '+range+' · '+filterNames+'. Dati sincronizzati; gli elementi non ancora inviati dai telefoni non sono disponibili qui.':'Le schede mostrano soltanto i dati già verificati. Le analisi diventano disponibili al termine del caricamento.';
  nodes.status.classList.toggle('cc-warning',model.partial||prior||monthlyStale);
  if(monthlyStale)nodes.status.textContent+=' Riepilogo mensile: mostrato l’ultimo dato disponibile; l’aggiornamento non è riuscito.';
  if(model.partial)nodes.status.textContent+=' Alcuni importi o archivi sono incompleti: i totali possono essere parziali.';
 }
 function renderSnapshots(){
  if(!permitted()||!atHome())return;
  const source=snapshot();model=deriveControlCenter(source);
  for(const [id,item]of Object.entries(nodes.kpis)){
   const value=model.kpis[id];const label=id==='faresMonthCents'?money(value):value===null?'—':String(value);
   if(item.value.textContent!==label)item.value.textContent=label;
   let hint=value===null?(id==='tripsToday'&&model.month&&model.month!==originalToday().slice(0,7)?'Fuori dal mese selezionato':'In attesa dei dati'):id==='companyCustomers'?'Sedi registrate':id==='pendingApprovals'?(model.scope.pendingApprovalsCapped?'Richieste caricate (limite 100)':'Richieste da verificare'):id==='faresMonthCents'?model.monthPartial?'Importi registrati · parziali':'Importi registrati':id==='tripsMonth'?monthLabel(model.month):id==='tripsToday'?dateLabel(originalToday()):id==='anomalies'?'Segnalazioni da verificare':'Accessi aziendali';
   if(source.report?.stale===true&&['tripsToday','tripsMonth','faresMonthCents'].includes(id)&&value!==null)hint+=' · ultimo dato disponibile';
   if(item.hint.textContent!==hint)item.hint.textContent=hint;
  }
  updateOptions('cc-driver',model.options.drivers.map(d=>({value:d.id,label:d.name})), 'Tutti gli autisti');
  updateOptions('cc-client',model.options.clients.map(value=>({value,label:value})),'Tutti i clienti');updateOptions('cc-city',model.options.cities.map(value=>({value,label:value})),'Tutte le località');
  renderCharts();renderOperations();renderSearch();renderStatus();
 }
 function updateOptions(id,items,all){
  const select=nodes[id],selected=select.value;
  const distinct=new Map(items.filter(i=>typeof i.value==='string'&&i.value.length).map(i=>[i.value,i]));
  if(selected&&!distinct.has(selected))distinct.set(selected,{value:selected,label:selected});
  const values=[...distinct.values()];patch(id,values,()=>{if(document.activeElement===select){signatures.delete(id);return;}select.replaceChildren();const empty=text('option','',all);empty.value='';select.append(empty);for(const itemof of values){const option=text('option','',itemof.label);option.value=itemof.value;select.append(option);}select.value=selected;});
 }
 function empty(host,label){host.replaceChildren(text('p','cc-chart-empty',label));}
 function barRows(id,rows,onChoose,{amount=false,labelEmpty='Nessun dato confermato per il periodo.',limit=8,unit='viaggi'}={}){
  const target=nodes[id];patch(id,rows,()=>{
   target.replaceChildren();if(!rows.length){empty(target,labelEmpty);return;}
   const values=rows.slice(0,limit),max=Math.max(1,...values.map(r=>amount?r.totalCents:r.count));
   for(const row of values){const figure=amount?money(row.totalCents):String(row.count);const b=button('',act(()=>onChoose(row)),'cc-bar cc-bar-row');b.setAttribute('aria-label',row.name+': '+figure+(amount?'':' '+unit));const progress=document.createElement('progress');progress.max=max;progress.value=Math.max(0,amount?row.totalCents:row.count);progress.setAttribute('aria-hidden','true');b.append(text('span','cc-bar-label',row.name),progress,text('strong','cc-bar-value',figure));target.append(b);}
  });
 }
 function renderCharts(){
  const daily=model.charts.daily;
  const dailyHost=nodes['cc-chart-daily'];
  if(document.activeElement?.id==='cc-trend-day')signatures.delete('cc-chart-daily');
  else patch('cc-chart-daily',daily,()=>{
   const target=dailyHost;target.replaceChildren();target.classList.remove('cc-day-chart');target.classList.add('cc-daily-plot');
   if(!daily.days.some(d=>d.known)){empty(target,'Il grafico apparirà con i dati del periodo verificato.');return;}
   const top=Math.max(1,...daily.days.map(d=>d.count||0)),left=20,width=620,base=164,height=140;
   const x=i=>left+i*width/Math.max(1,daily.days.length-1),y=count=>base-(count/top)*height;
   const svg=svgNode('svg',{viewBox:'0 0 660 190',role:'img','aria-label':'Viaggi giornalieri: seleziona il giorno con il cursore sotto il grafico',class:'cc-sparkline'});
   for(let step=0;step<4;step++)svg.append(svgNode('line',{x1:left,x2:left+width,y1:base-step*height/3,y2:base-step*height/3,class:'cc-chart-gridline'}));
   let group=[];const finishGroup=()=>{if(!group.length)return;svg.append(svgNode('polyline',{points:group.map(p=>p.join(',')).join(' '),fill:'none',class:'cc-trend-line'}));group=[];};
   for(const [i,day]of daily.days.entries()){if(day.known)group.push([x(i),y(day.count)]);else finishGroup();}finishGroup();
   const dot=svgNode('circle',{r:5,class:'cc-trend-selected'});svg.append(dot);
   const controls=text('div','cc-daily-controls'),range=document.createElement('input');range.type='range';range.id='cc-trend-day';range.min='0';range.max=String(daily.days.length-1);range.step='1';range.value=String(Math.min(daily.days.length-1,Math.max(0,selectedTrendDay)));range.setAttribute('aria-label','Scegli il giorno del grafico');
   const caption=text('p','cc-status-note');caption.id='cc-day-selection';caption.setAttribute('aria-live','polite');
   const open=button('Apri giorno selezionato',act(()=>{const day=daily.days[Number(range.value)];if(day?.known)route('trips',{...shownQuery(),month:day.date.slice(0,7),fromDate:day.date,toDate:day.date});}),'button outline');open.id='cc-open-day';
   const updateSelection=()=>{selectedTrendDay=Number(range.value);const day=daily.days[selectedTrendDay];if(!day)return;const label=dateLabel(day.date)+': '+(day.known?day.count+(day.count===1?' viaggio':' viaggi'):'fuori dal periodo verificato');range.setAttribute('aria-valuetext',label);caption.textContent=label;open.disabled=!day.known;if(day.known){dot.setAttribute('cx',x(selectedTrendDay));dot.setAttribute('cy',y(day.count));dot.removeAttribute('hidden');}else dot.setAttribute('hidden','');};
   range.addEventListener('input',updateSelection);
   svg.addEventListener('click',event=>{if(!canAct())return;const rect=svg.getBoundingClientRect();if(rect.width<=0)return;const position=(event.clientX-rect.left)/rect.width*660;range.value=String(Math.max(0,Math.min(daily.days.length-1,Math.round((position-left)/width*(daily.days.length-1)))));updateSelection();});
   controls.append(range,caption,open);target.append(svg,controls);target.dataset.complete=String(daily.complete);updateSelection();
  });
  barRows('cc-chart-drivers',model.charts.drivers,row=>route('trips',{...shownQuery(),driverId:row.id}));
  const monthly=model.charts.monthly.map(row=>({id:row.month,name:monthLabel(row.month),count:row.trips,totalCents:row.totalCents}));
  barRows('cc-chart-monthly',monthly,row=>applyShownFilters({month:row.id,fromDate:row.id+'-01',toDate:endMonth(row.id),client:'',city:''}),{limit:12});
  barRows('cc-chart-client-values',model.charts.clients,row=>applyShownFilters({client:row.id}),{amount:true});
  barRows('cc-chart-clients',model.charts.clients,row=>applyShownFilters({client:row.id}));
  barRows('cc-chart-cities',model.charts.cities,row=>applyShownFilters({city:row.id}));
  const anomalyCaption=host.querySelector('[data-chart="anomalies"] .cc-chart-caption');
  if(anomalyCaption)anomalyCaption.textContent=model.scope.alertsTruncated?'Distribuzione delle '+model.scope.alertsLoaded+' segnalazioni caricate su '+model.scope.alertsTotal+' totali.':'Segnalazioni restituite dal sistema, da verificare.';
  barRows('cc-chart-anomalies',model.charts.anomalies,row=>route('alerts',{...shownQuery(),alertType:row.id}),{unit:'segnalazioni',labelEmpty:model.kpis.anomalies===0?'Nessuna anomalia nei dati controllati.':'Segnalazioni non ancora disponibili.'});
 }
 function operation(id,rows,render,emptyLabel){patch(id,rows,()=>{const root=nodes[id];root.replaceChildren();if(!rows.length){root.append(text('p','cc-chart-empty',emptyLabel));return;}for(const row of rows)root.append(render(row));});}
 function operationButton(title,details,handler){const b=button('',act(handler),'cc-operation');const copy=text('span','cc-operation-copy');copy.append(text('strong','',title),text('small','',details));b.append(copy,icon('arrow'));return b;}
 function renderOperations(){
  operation('cc-recent-trips',model.recentTrips,row=>operationButton(row.container||'Viaggio registrato',dateLabel(row.date)+' · '+(row.client||'Cliente non indicato')+' · '+(row.driverName||''),()=>openTrip(row)),model.scope.tripSearch==='unavailable'?'Viaggi non ancora disponibili.':'Nessun viaggio nel periodo selezionato.');
  operation('cc-pending-approvals',model.operations.approvals,row=>operationButton(row.name||'Richiesta cliente',(row.city||'Località non indicata')+(row.submittedAt&&stamp(row.submittedAt)?' · '+stamp(row.submittedAt):''),()=>openApprovals(row.id)),model.kpis.pendingApprovals===null?'Richieste non ancora verificate.':'Nessuna richiesta in attesa.');
  operation('cc-alerts',model.operations.alerts,row=>operationButton(row.detail||'Segnalazione da verificare',row.type==='sync'?'Archivio senza aggiornamenti recenti; non indica la coda del telefono.':row.date?dateLabel(row.date):'Controlla i dati sincronizzati.',()=>{const record=row.driverId&&row.tripId&&model.scope.recordsComplete?insights.records.find(item=>item.driverId===row.driverId&&item.id===row.tripId):null;if(record)openTrip(record);else route('alerts',{...shownQuery(),driverId:row.driverId||null,alertType:row.type,fromDate:row.date||shownQuery().fromDate,toDate:row.date||shownQuery().toDate});}),model.kpis.anomalies===0?'Nessuna anomalia nei dati controllati.':'Segnalazioni non ancora disponibili.');
  operation('cc-company-updates',model.operations.updates,row=>operationButton(row.label,stamp(row.at)||'Data non disponibile',()=>row.kind==='trip'?openTrip(row.row):openCustomer(row.row)),'Nessuna data di aggiornamento disponibile nei record caricati.');
 }
 function renderSearch(){
  if(!permitted())return;
  const value=nodes.search.value.trim();nodes.searchResults.hidden=!value;if(!value){nodes.searchResults.replaceChildren();signatures.delete('search');return;}
  const source=snapshot(),found=searchAuthorized({query:value,roster:source.roster,report:source.report,insights,customers:source.customerStats});
  patch('search',{value,found},()=>{
   nodes.searchResults.replaceChildren();let count=0;
   const groups=[['drivers','Autisti',item=>route('drivers',{phone:item.row.phone,query:item.row.phone})],['customers','Clienti aziendali',item=>openCustomer(item.row)],['trips','Viaggi',item=>openTrip(item.row)],['localities','Località',item=>applyShownFilters({city:item.row.city})]];
   for(const [kind,label,handler]of groups){if(!found[kind].length)continue;count+=found[kind].length;const group=text('section','cc-search-group');group.append(text('h3','',label));for(const itemof of found[kind]){const b=button('',act(()=>handler(itemof)),'cc-search-result');b.append(text('strong','',itemof.label),text('small','',kind==='trips'?dateLabel(itemof.row.date)+' · '+(itemof.row.client||''):kind==='customers'?itemof.row.city||'':kind==='drivers'?itemof.row.phone||'':'Apri i viaggi della località'));group.append(b);}nodes.searchResults.append(group);}
   if(!count)nodes.searchResults.append(text('p','cc-chart-empty','Nessun risultato nei dati caricati e autorizzati.'));
   nodes.searchResults.append(text('p','cc-status-note',found.scope==='complete-period'?'La ricerca dei viaggi copre il periodo verificato '+dateLabel(shownQuery().fromDate)+' – '+dateLabel(shownQuery().toDate)+'.':'La ricerca dei viaggi include soltanto le pagine già caricate.'));
  });
 }
 function showingPreviousScope(){return Boolean(insights&&insightKey!==String(owner)+':'+JSON.stringify(query()));}
 function shownQuery(){return insightQuery?{...insightQuery}:query();}
 function sameQuery(a,b){return safeSignature(a)===safeSignature(b);}
 async function loadInsights({force=false}={}){
  if(!canAct()||typeof account?.companyInsights!=='function')return false;
  let value;try{value=query();validateQuery(value);}catch(err){error=err.message;renderStatus();return false;}
  const expectedOwner=owner,key=String(owner)+':'+JSON.stringify(value);desiredKey=key;
  if(!force&&key===insightKey&&insights)return true;
  const current=requests.get(key);
  if(current){await current;return key===insightKey;}
  const sequence=requestSeq;loading=true;error='';renderStatus();
  const work=(async()=>{
   try{
    const result=await Promise.resolve().then(()=>account.companyInsights(value));
    if(!verified()||dashboard.hidden||ownerId()!==expectedOwner||owner!==expectedOwner||sequence!==requestSeq||desiredKey!==key)return false;
    if(!result||result.month!==value.month||!Array.isArray(result.records)||!Array.isArray(result.daily)||!Array.isArray(result.monthly)||!Array.isArray(result.alerts)||!result.summary||result.records.length!==result.summary.trips||!sameQuery({fromDate:result.range?.fromDate,toDate:result.range?.toDate},{fromDate:value.fromDate,toDate:value.toDate}))throw Error('Il servizio ha restituito analisi incomplete: riprova.');
    const normalized=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('it-IT');
    if(result.selection&&((result.selection.driverId||null)!==(value.driverId||null)||normalized(result.selection.client)!==normalized(value.client)||normalized(result.selection.city)!==normalized(value.city)))throw Error('Le analisi ricevute non corrispondono ai filtri richiesti. Riprova.');
    insights=result;insightQuery={...value};insightKey=key;lastFetchAt=Date.now();loading=false;changingFilters=false;error='';renderSnapshots();return true;
   }catch(err){
    if(!verified()||dashboard.hidden||ownerId()!==expectedOwner||expectedOwner!==owner||sequence!==requestSeq||desiredKey!==key)return false;
    loading=false;error=err?.message||'Analisi non disponibili. Riprova senza cambiare schermata.';renderStatus();return false;
   }finally{if(requests.get(key)===work)requests.delete(key);}
  })();
  requests.set(key,work);return work;
 }
 function refresh({force=false,forceInsights=false}={}){
  if(!mounted)mount();
  if(!verified()||dashboard.hidden){if(owner!==null)reset();return;}
  if(!permitted())return;
  const id=ownerId();if(typeof id!=='string'||!id)return;
  if(owner!==id){reset();owner=id;preferences=readPreferences();renderActions();}
  if(!atHome())return;
  renderSnapshots();
  const report=getReport(),version=report?safeSignature([report.month,report.driverId,report.summary,report.chart,report.drivers,report.trips,report.incompleteArchives]):null;
  const changed=version!==loadedReportStamp;loadedReportStamp=version;
  const reportAt=Date.parse(report?.reportedAt),insightsAt=Date.parse(insights?.reportedAt);
  const reportIsNewer=!insights||!Number.isFinite(reportAt)||!Number.isFinite(insightsAt)||reportAt>insightsAt;
  if(force){setReportFilters({month:query().month,driverId:query().driverId,refresh:true});void loadInsights({force:true});}
  else if(forceInsights||!insights||changed&&reportIsNewer)void loadInsights({force:forceInsights||changed});
 }
 function reset(){
  requestSeq++;requests.clear();owner=null;insights=null;insightQuery=null;insightKey=null;selectedTrendDay=29;desiredKey=null;loadedReportStamp=null;lastFetchAt=0;error='';loading=false;changingFilters=false;model=deriveControlCenter();preferences=normalizeActionPreferences();signatures.clear();
  if(!mounted)return;
  nodes.search.value='';nodes.searchResults.replaceChildren();nodes.searchResults.hidden=true;setDefaultFilters();
  for(const itemof of Object.values(nodes.kpis)){itemof.value.textContent='—';itemof.hint.textContent='In attesa dei dati';}
  for(const id of ['cc-driver','cc-client','cc-city']){nodes[id].replaceChildren();const option=text('option','','Tutti');option.value='';nodes[id].append(option);}
  for(const id of ['cc-chart-daily','cc-chart-drivers','cc-chart-monthly','cc-chart-client-values','cc-chart-clients','cc-chart-cities','cc-chart-anomalies','cc-recent-trips','cc-pending-approvals','cc-alerts','cc-company-updates'])nodes[id].replaceChildren();
  nodes.error.textContent='';nodes.error.hidden=true;nodes.sync.textContent='In attesa dei dati autorizzati';nodes.status.textContent='Accedi con l’account amministratore per consultare i dati.';host.setAttribute('aria-busy','false');renderActions();
 }
 function scheduledRefresh(){if(queue)return;queue=true;queueMicrotask(()=>{queue=false;refresh();});}
 for(const name of ['lts-admin-data-refreshed','lts-admin-roster-refreshed','lts-admin-customers-refreshed','lts-admin-approvals-refreshed'])window.addEventListener(name,scheduledRefresh);
 new MutationObserver(scheduledRefresh).observe(dashboard,{attributes:true,attributeFilter:['data-view','data-home-section','hidden','inert']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduledRefresh();});
 mount();
 return {refresh,reset,openCustomers};
}
