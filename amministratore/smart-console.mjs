import {searchSmartConsole,smartConsoleAlerts,smartCommandIntent} from './smart-console-model.mjs?v=20261108-smart-v1';

const byId=id=>document.getElementById(id);
const el=(tag,className='',value='')=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 node.textContent=String(value);
 return node;
};
const safeCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export function setupSmartConsole({
 authorized,getDrivers,getReport,getCustomers,openView,openRecords,openCustomer,openManualCustomer,
 prepareRateInline,clearPrivateCode
}){
 const trigger=byId('smart-command-open'),overlay=byId('smart-overlay'),
  panel=byId('smart-panel'),closeButton=byId('smart-close'),
  back=byId('smart-back'),search=byId('smart-search'),
  results=byId('smart-results'),summary=byId('smart-context'),
  home=byId('smart-home'),embedded=byId('smart-embedded'),
  embedBody=byId('smart-embed-body'),heading=byId('smart-heading'),
  detail=byId('smart-detail'),detailBody=byId('smart-detail-body'),
  detailActions=byId('smart-detail-actions'),detailSource=byId('smart-detail-source');
 let moved=[],lastFocus=null,mode='home',openState=false;
 let rateDirty=false,rateSaving=false,rateAttempt=0;
 const leaveAllowed=()=>{
  if(mode!=='rate')return true;
  if(rateSaving)return false; // Do not detach the live form while saving.
  return !rateDirty||window.confirm('Ci sono modifiche alla tariffa non salvate. Uscire senza salvarle?');
 };
 const leave=callback=>{if(leaveAllowed())callback();};
 const allowed=()=>Boolean(authorized())&&navigator.onLine!==false;
 const isVisible=()=>openState&&!overlay.hidden;

 function restoreEmbedded(){
  for(const item of moved.slice().reverse()){
   if(!item.original.isConnected)continue;
   if(item.next?.parentNode===item.parent)
    item.parent.insertBefore(item.original,item.next);
   else item.parent.append(item.original);
  }
  moved=[];
  embedBody.replaceChildren();
  embedded.hidden=true;
  byId('smart-secret-hint').hidden=true;
  clearPrivateCode();
 }
 function close({focus=true,clearSearch=true}={}){
  rateAttempt++;rateSaving=false;rateDirty=false;
  if(moved.length)restoreEmbedded();
  overlay.hidden=true;openState=false;mode='home';
  home.hidden=false;embedded.hidden=true;detail.hidden=true;back.hidden=true;
  detailBody.replaceChildren();detailActions.replaceChildren();
  document.body.classList.remove('smart-is-open');
  byId('dashboard').inert=false;
  trigger.setAttribute('aria-expanded','false');
  if(clearSearch){search.value='';results.replaceChildren();}
  if(focus&&authorized())(lastFocus?.isConnected?lastFocus:trigger).focus();
  lastFocus=null;
 }
 function goTo(view){
  close({focus:false});
  if(!authorized())return;
  openView(view);
 }
 function moveExisting(section){
  if(!section||!section.parentNode)return;
  moved.push({original:section,parent:section.parentNode,next:section.nextSibling});
  embedBody.append(section);
 }
 function showTask(kind){
  if(!allowed())return;
  restoreEmbedded();
  const invite=kind==='invite',target=byId(invite?'invite-form':'restore-form');
  const section=target?.closest('section');
  if(!section)return;
  mode=kind;
  heading.textContent=invite?'Invita un autista':'Reinserisci un autista';
  home.hidden=true;embedded.hidden=false;back.hidden=false;
  moveExisting(section);
  moveExisting(byId('secret-panel'));
  byId('smart-secret-hint').hidden=false;
  const first=target.querySelector('input');
  first?.focus();
 }
 function showRateTask(site=null){
  if(!allowed()||rateSaving)return;
  const section=byId('company-rates-editor');
  if(!section)return;
  const selected=String(byId('company-rate-client')?.value||'').trim();
  const place=String(byId('company-rate-city')?.value||'').trim();
  const amount=String(byId('company-rate-amount')?.value||'').trim();
  if(site?.name&&amount&&
    (selected.toLocaleUpperCase('it-IT')!==String(site.name).trim().toLocaleUpperCase('it-IT')||
     place.toLocaleUpperCase('it-IT')!==String(site.city).trim().toLocaleUpperCase('it-IT'))&&
     !window.confirm('C’è una tariffa non salvata. Sostituire la bozza con la nuova sede?'))return;
  if(mode==='rate'&&!leaveAllowed())return;
  const attempt=++rateAttempt;
  rateDirty=false;
  restoreEmbedded();
  home.hidden=true;embedded.hidden=false;detail.hidden=true;back.hidden=false;
  mode='rate';heading.textContent=site?.name?'Tariffa della sede':'Gestisci tariffa';
  moveExisting(section);
  const editorStatus=byId('company-rates-status');
  editorStatus.textContent='Verifica online dei dati aziendali…';
  back.focus();
  void prepareRateInline(site).then(ok=>{
   if(attempt!==rateAttempt||!isVisible()||mode!=='rate')return;
   if(!ok)editorStatus.textContent='Impossibile verificare l’elenco completo. Riprovare online prima di salvare.';
  }).catch(()=>{
   if(attempt===rateAttempt&&isVisible()&&mode==='rate')
    editorStatus.textContent='Servizio non disponibile. Nessuna modifica è stata salvata.';
  });
 }
 function showDetail(spec,item){
  if(!allowed()||!spec||!item?.row)return;
  const record=item.row;
  detailBody.replaceChildren();detailActions.replaceChildren();
  const details=el('dl','smart-detail-fields');
  function field(label,value){
   if(value===undefined||value===null||!String(value).trim())return;
   const cell=el('div','smart-detail-field');
   cell.append(el('dt','',label),el('dd','',String(value)));
   details.append(cell);
  }
  if(spec.kind==='drivers'){
   field('Telefono',record.phone);field('Stato accesso',record.status);
   if(record.phone){
    appendAction(detailActions,'Viaggi dell’autista',()=>{
     close({focus:false});openRecords(record.phone,'trip');
    });
    appendAction(detailActions,'Clienti personali',()=>{
     close({focus:false});openRecords(record.phone,'customer');
    });
   }
   appendAction(detailActions,'Gestisci accesso',()=>goTo('drivers'));
  }else if(spec.kind==='customers'){
   field('Località',record.city);field('Indirizzo',record.address);
   appendAction(detailActions,'Modifica tariffa della sede',()=>showRateTask(record));
  }else if(spec.kind==='trips'){
   field('Data',record.date);field('Autista',record.driverName);
   field('Cliente',record.client);field('Località',record.city);
   field('Container',record.container);
   const cents=record.totalCents??record.amountCents;
   if(Number.isSafeInteger(cents)&&cents>=0)field('Valore registrato',new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100));
   field('Seconda presa',record.secondClient?[record.secondClient,record.secondCity].filter(Boolean).join(' · '):'');
   field('Nota',record.note);
   appendAction(detailActions,'Apri registro del periodo',()=>goTo('trips'));
  }
  detailBody.append(el('h3','smart-detail-title',item.label),details);
  detailSource.textContent='Anteprima dei soli dati aziendali già caricati e sincronizzati. Le modifiche richiedono la procedura originale con verifica e conferma.';
  home.hidden=true;embedded.hidden=true;detail.hidden=false;back.hidden=false;
  mode='detail';heading.textContent='Scheda rapida';
  back.focus();
 }
 function resetTask(){
  rateAttempt++;rateSaving=false;rateDirty=false;
  if(moved.length)restoreEmbedded();
  detail.hidden=true;detailBody.replaceChildren();detailActions.replaceChildren();
  home.hidden=false;embedded.hidden=true;back.hidden=true;
  mode='home';heading.textContent='Trova e agisci';
  search.focus();
  render();
 }
 function appendAction(target,label,onClick){
  const b=el('button','smart-action',label);b.type='button';
  b.addEventListener('click',()=>{if(allowed())onClick();});
  target.append(b);
  return b;
 }
 function showStats(){
  summary.replaceChildren();
  const roster=getDrivers(),report=getReport(),customers=getCustomers();
  const stats=el('div','smart-metrics');
  const metric=(value,label)=>{
   const box=el('div','smart-metric');
   box.append(el('strong','',value),el('span','',label));stats.append(box);
  };
  metric(String(roster.length),'autisti caricati');
  const count=safeCount(report?.summary?.trips);
  metric(count===null?'—':String(count),'viaggi nel periodo');
  metric(customers?.customers?String(customers.customers.length):'—','sedi aziendali');
  summary.append(stats);
  const alerts=smartConsoleAlerts({drivers:roster,report,customerStats:customers});
  const area=el('div','smart-suggestions');
  if(alerts.length){
   area.append(el('strong','smart-section-title','Da verificare'));
   for(const notice of alerts.slice(0,4)){
    const b=el('button','smart-alert',notice.label+'  ›');
    b.type='button';
    b.addEventListener('click',()=>{
     if(notice.kind==='pending')goTo('drivers');
     else if(notice.kind==='unpriced')goTo('rates');
     else goTo('alerts');
    });
    area.append(b);
   }
  }else area.append(el('p','smart-muted','Nessuna segnalazione nei dati attualmente caricati. Gli archivi non sincronizzati non sono verificati.'));
  summary.append(area);
 }
 function renderSearch(){
  results.replaceChildren();
  const q=search.value.trim();
  if(!q){
   results.append(el('p','smart-muted','Cerca autista, telefono, cliente, località o container. Le ricerche usano solo i dati già caricati e autorizzati.'));
   return;
  }
  const task=smartCommandIntent(q);
  if(task){
   const group=el('section','smart-result-group');
   group.append(el('h3','','Azione suggerita'));
   appendAction(group,task.label,()=>action(task.action));
   results.append(group);
  }
  const report=getReport(),catalog=getCustomers();
  const found=searchSmartConsole({
   query:q,drivers:getDrivers(),customers:catalog?.customers,
   trips:report?.trips,limit:6
  });
  const specs=[
   {kind:'drivers',name:'Autisti',caption:item=>{
    const d=item.row;
    const caption=[d.phone||'',d.status||''].filter(Boolean).join(' · ');
    return caption;
   },open:item=>{
    const phone=item.row.phone;
    if(phone){close({focus:false});openRecords(phone,'trip');}
    else goTo('drivers');
   },button:'Apri dati'},
   {kind:'customers',name:'Clienti aziendali',caption:item=>[item.row.city,item.row.address].filter(Boolean).join(' · '),
    open:item=>{close({focus:false});openCustomer(item.row);},button:'Apri tariffa'},
   {kind:'trips',name:'Viaggi del periodo caricato',caption:item=>{
    const t=item.row;
    return [t.driverName,t.client,t.city,t.date].filter(Boolean).join(' · ');
   },open:()=>goTo('trips'),button:'Apri registro'}
  ];
  let total=0;
  for(const spec of specs){
   const matches=found[spec.kind];if(!matches.length)continue;
   total+=matches.length;
   const group=el('section','smart-result-group');
   group.append(el('h3','',spec.name));
   for(const item of matches){
    const row=el('div','smart-result');
    const body=el('div','smart-result-description');
    body.append(el('strong','',item.label),el('small','',spec.caption(item)));
    row.append(body);
    const buttons=el('div','smart-result-buttons');
    const preview=appendAction(buttons,'Dettagli',()=>showDetail(spec,item));
    preview.setAttribute('aria-label','Mostra dettagli di '+item.label);
    const direct=appendAction(buttons,spec.button,()=>spec.open(item));
    direct.setAttribute('aria-label',spec.button+' · '+item.label);
    row.append(buttons);
    group.append(row);
   }
   results.append(group);
  }
  if(!total&&!task)results.append(el('p','smart-muted','Nessuna corrispondenza nei dati caricati. Per una ricerca completa apri l’archivio interessato.'));
 }
 function render(){
  if(!isVisible()||!allowed()){if(openState)close({focus:false});return;}
  showStats();renderSearch();
 }
 function open(){
  if(!allowed())return;
  lastFocus=document.activeElement;
  openState=true;overlay.hidden=false;
  document.body.classList.add('smart-is-open');
  byId('dashboard').inert=true;
  trigger.setAttribute('aria-expanded','true');
  home.hidden=false;embedded.hidden=true;detail.hidden=true;back.hidden=true;
  mode='home';heading.textContent='Trova e agisci';
  render();search.focus();
 }
 function action(action){
  if(!allowed())return;
  if(action==='invite'||action==='restore')showTask(action);
  else if(action==='inline-rate')showRateTask();
  else if(action==='drivers'||action==='trips'||action==='rates'||
          action==='alerts'||action==='exports'||action==='analysis'||
          action==='records'||action==='security')goTo(action);
  else if(action==='customers')goTo('rates');
  else if(action==='manual'){
   close({focus:false});if(authorized())openManualCustomer();
  }
 }
 trigger.addEventListener('click',()=>{if(isVisible())leave(()=>close());else open();});
 document.querySelectorAll('[data-smart-open]').forEach(button=>
  button.addEventListener('click',open));
 byId('smart-scrim').addEventListener('click',()=>leave(()=>close()));
 closeButton.addEventListener('click',()=>leave(()=>close()));
 back.addEventListener('click',()=>leave(resetTask));
 const rateForm=byId('company-rates-form');
 rateForm.addEventListener('input',()=>{if(mode==='rate')rateDirty=true;});
 rateForm.addEventListener('change',()=>{if(mode==='rate')rateDirty=true;});
 window.addEventListener('lts-admin-company-rate-save-started',()=>{if(mode==='rate')rateSaving=true;});
 window.addEventListener('lts-admin-company-rate-saved',()=>{rateDirty=false;});
 window.addEventListener('lts-admin-company-rate-save-completed',()=>{rateSaving=false;});
 home.querySelectorAll('[data-smart-action]').forEach(button=>
  button.addEventListener('click',()=>action(button.dataset.smartAction)));
 search.addEventListener('input',renderSearch);
 search.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||!search.value.trim())return;
  const first=results.querySelector('.smart-result-buttons .smart-action');
  if(!first)return;
  event.preventDefault();first.click();
 });
 window.addEventListener('lts-admin-data-refreshed',()=>{
  if(!isVisible())return;
  if(mode==='home')render();
  else if(mode==='detail')resetTask(); // Do not show a stale preview after data refresh.
 });
 document.addEventListener('keydown',event=>{
  if(!event.defaultPrevented&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
   if(!authorized())return;
   event.preventDefault();if(isVisible())leave(()=>close());else open();return;
  }
  if(!isVisible())return;
  if(event.key==='Escape'){event.preventDefault();leave(()=>{if(mode==='home')close();else resetTask();});return;}
  if(event.key!=='Tab')return;
  const focusable=[...panel.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),a[href]')]
   .filter(node=>node.getClientRects().length>0);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 const authObserver=new MutationObserver(()=>{
  if(openState&&!authorized())close({focus:false});
 });
 authObserver.observe(byId('dashboard'),{attributes:true,attributeFilter:['hidden']});
 authObserver.observe(byId('mfa-panel'),{attributes:true,attributeFilter:['hidden']});
 // Keep secret codes inside the drawer until copied; never cache them.
 const secretObserver=new MutationObserver(()=>{
  if(moved.length&&!byId('secret-panel').hidden){
   byId('smart-secret-hint').textContent='Copia il codice monouso prima di chiudere. Non sarà conservato.';
   byId('secret-panel').scrollIntoView({block:'nearest'});
  }
 });
 secretObserver.observe(byId('secret-panel'),{attributes:true,attributeFilter:['hidden']});
 return {
  openTrip(row){
   if(!allowed()||!row||typeof row!=='object')return false;
   open();showDetail({kind:'trips'},{row,label:row.container||row.client||'Viaggio'});return true;
  },
  refresh(){if(isVisible()&&mode==='home')render();},
  reset(){close({focus:false});search.value='';results.replaceChildren();}
 };
}
