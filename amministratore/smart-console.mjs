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
 clearPrivateCode
}){
 const trigger=byId('smart-command-open'),overlay=byId('smart-overlay'),
  panel=byId('smart-panel'),closeButton=byId('smart-close'),
  back=byId('smart-back'),search=byId('smart-search'),
  results=byId('smart-results'),summary=byId('smart-context'),
  home=byId('smart-home'),embedded=byId('smart-embedded'),
  embedBody=byId('smart-embed-body'),heading=byId('smart-heading');
 let moved=[],lastFocus=null,mode='home',openState=false;
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
  if(moved.length)restoreEmbedded();
  overlay.hidden=true;openState=false;mode='home';
  home.hidden=false;embedded.hidden=true;back.hidden=true;
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
 function resetTask(){
  if(moved.length)restoreEmbedded();
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
    appendAction(row,spec.button,()=>spec.open(item));
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
  home.hidden=false;embedded.hidden=true;back.hidden=true;
  mode='home';heading.textContent='Trova e agisci';
  render();search.focus();
 }
 function action(action){
  if(!allowed())return;
  if(action==='invite'||action==='restore')showTask(action);
  else if(action==='drivers'||action==='trips'||action==='rates'||
          action==='alerts'||action==='exports'||action==='analysis'||
          action==='records'||action==='security')goTo(action);
  else if(action==='customers')goTo('rates');
  else if(action==='manual'){
   close({focus:false});if(authorized())openManualCustomer();
  }
 }
 trigger.addEventListener('click',()=>{if(isVisible())close();else open();});
 document.querySelectorAll('[data-smart-open]').forEach(button=>
  button.addEventListener('click',open));
 byId('smart-scrim').addEventListener('click',()=>close());
 closeButton.addEventListener('click',()=>close());
 back.addEventListener('click',resetTask);
 home.querySelectorAll('[data-smart-action]').forEach(button=>
  button.addEventListener('click',()=>action(button.dataset.smartAction)));
 search.addEventListener('input',renderSearch);
 window.addEventListener('lts-admin-data-refreshed',()=>{if(isVisible()&&mode==='home')render();});
 document.addEventListener('keydown',event=>{
  if(!event.defaultPrevented&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
   if(!authorized())return;
   event.preventDefault();if(isVisible())close();else open();return;
  }
  if(!isVisible())return;
  if(event.key==='Escape'){event.preventDefault();close();return;}
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
  refresh(){if(isVisible()&&mode==='home')render();},
  reset(){close({focus:false});search.value='';results.replaceChildren();}
 };
}
