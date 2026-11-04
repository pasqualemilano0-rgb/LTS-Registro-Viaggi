/** Administrator reporting UI. Aggregates are authoritative only when returned by the API. */
import {setupInsights} from './report-insights.mjs?v=20261104-company-v3';
const el=id=>document.getElementById(id);
function node(tag,className='',value=''){
 const e=document.createElement(tag);
 if(className)e.className=className;
 e.textContent=String(value);
 return e;
}
function currency(cents){
 return Number.isSafeInteger(cents)&&cents>=0
  ?new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100)
  :'—';
}
function dateLabel(value){
 return /^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
}
function currentMonth(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
function clearData(){
 for(const id of ['report-chart','report-amount-chart','report-driver-chart','report-driver-cards','report-rows'])
  el(id).replaceChildren();
 for(const id of ['report-count','report-driver-count','report-total','report-missing',
                  'report-profile-trips','report-profile-days','report-profile-average','report-profile-total'])
  el(id).textContent='—';
 el('report-profile-title').textContent='Profilo autista';
 el('report-profile-avatar').textContent='—';
 el('report-profile-status').textContent='';
 el('report-profile-note').textContent='';
 el('report-profile-note').hidden=true;
 el('report-driver-profile').hidden=true;
 el('report-driver-count-label').textContent='Autisti con viaggi';
 el('report-driver-count-note').textContent='Con attività nel mese';
 el('report-directory-count').textContent='—';
 el('report-directory-empty').hidden=true;
 el('report-register-caption').textContent='Elenco degli inserimenti del periodo selezionato.';
 el('report-next').hidden=true;
 el('report-warning').textContent='';
}
function makeBar(label,value,max,currencyValue=false){
 const row=node('div','report-bar-row');
 const title=node('span','report-bar-name',label);
 const track=document.createElement('progress');
 track.className='report-bar-progress';
 track.max=Math.max(1,max);
 track.value=Math.max(0,Math.min(max,value));
 track.setAttribute('aria-label',label+': '+(currencyValue?currency(value):String(value)+' viaggi'));
 const figure=node('strong','report-bar-value',currencyValue?currency(value):String(value));
 row.append(title,track,figure);
 return row;
}
function renderDayChart(days){
 const chart=el('report-chart');chart.replaceChildren();
 const values=Array.isArray(days)?days:[];
 if(!values.length){chart.append(node('p','empty','Nessun viaggio nel periodo.'));return;}
 const top=Math.max(1,...values.map(d=>d.count));
 for(const day of values){
  chart.append(makeBar(dateLabel(day.date),day.count,top));
 }
}
function renderDrivers(drivers){
 const target=el('report-driver-chart');target.replaceChildren();
 const filtered=(Array.isArray(drivers)?drivers:[]).filter(d=>d.trips>0).slice(0,50);
 if(!filtered.length){target.append(node('p','empty','Nessun autista con viaggi nel mese.'));return;}
 const max=Math.max(1,...filtered.map(d=>d.trips));
 for(const driver of filtered)target.append(makeBar(driver.name,driver.trips,max));
}
function renderAmountChart(days){
 const target=el('report-amount-chart');target.replaceChildren();
 const values=Array.isArray(days)?days:[];
 if(!values.length){target.append(node('p','empty','Nessun importo registrato nel periodo.'));return;}
 const max=Math.max(1,...values.map(d=>d.totalCents));
 for(const day of values)target.append(makeBar(dateLabel(day.date),day.totalCents,max,true));
}
function initials(name){
 const chunks=String(name||'').trim().split(/\s+/).filter(Boolean);
 return (chunks.length?chunks.length===1?chunks[0].slice(0,2):chunks[0][0]+chunks[chunks.length-1][0]:'—').toLocaleUpperCase('it-IT');
}
function driverDirectory(drivers,selectedId,onSelect,search=''){
 const target=el('report-driver-cards');target.replaceChildren();
 const nameQuery=String(search||'').trim().toLocaleLowerCase('it-IT');
 const all=Array.isArray(drivers)?drivers:[];
 const matched=all.filter(d=>String(d.name||'').toLocaleLowerCase('it-IT').includes(nameQuery));
 el('report-directory-count').textContent=matched.length+' di '+all.length;
 el('report-directory-empty').hidden=matched.length>0;
 for(const d of matched){
  const button=document.createElement('button');
  button.type='button';button.className='report-person-card';
  button.setAttribute('aria-pressed',String(d.id===selectedId));
  button.setAttribute('aria-label','Apri scheda di '+d.name+', '+d.trips+' viaggi nel mese');
  if(!d.active)button.classList.add('report-person-disabled');
  const avatar=node('span','report-person-avatar',initials(d.name));
  avatar.setAttribute('aria-hidden','true');
  const text=node('span','report-person-main');
  text.append(node('strong','report-person-name',d.name),
    node('span','report-person-meta',d.days+' giorni con attività'),
    node('span','report-person-value',currency(d.totalCents)));
  const end=node('span','report-person-end');
  end.append(node('strong','',d.trips),node('small','',d.trips===1?'viaggio':'viaggi'),
    node('span','report-open-indicator',d.id===selectedId?'Selezionato ✓':'Apri scheda ›'));
  if(!d.active)end.append(node('span','report-person-status','Accesso non attivo'));
  button.append(avatar,text,end);
  button.addEventListener('click',()=>onSelect(d.id));
  target.append(button);
 }
}
function driverProfile(drivers,selectedId){
 const target=el('report-driver-profile');
 const current=(Array.isArray(drivers)?drivers:[]).find(d=>d.id===selectedId);
 target.hidden=!current;
 if(!current)return null;
 el('report-profile-title').textContent=current.name;
 el('report-profile-avatar').textContent=initials(current.name);
 el('report-profile-status').textContent=current.active?'Account con accesso attivo':'Account con accesso non attivo';
 el('report-profile-trips').textContent=String(current.trips);
 el('report-profile-days').textContent=String(current.days);
 el('report-profile-average').textContent=current.trips?currency(Math.round(current.totalCents/current.trips)):'—';
 el('report-profile-total').textContent=currency(current.totalCents);
 const warning=Number.isInteger(current.missingTariffCount)?current.missingTariffCount:0;
 const note=el('report-profile-note');
 note.textContent=warning>0?
  warning+' viaggio/i con tariffe da completare: il totale è parziale.':
  'Valori relativi al mese selezionato e ai soli viaggi sincronizzati.';
 note.hidden=false;
 return current;
}
function tableRow(trip){
 const row=document.createElement('tr');
 const cell=(label,value)=>{const td=node('td','',value);td.dataset.label=label;row.append(td);return td;};
 cell('Autista',trip.driverName);
 cell('Data',dateLabel(trip.date));
 cell('Container',trip.container);
 const route=cell('Cliente e località',trip.client);
 route.append(node('small','report-muted',trip.city||''));
 const amount=cell('Importo registrato',currency(trip.totalCents));
 if(trip.missingTariff)amount.append(node('span','report-partial','Parziale · tariffa mancante'));
 const extra=document.createElement('td');
 extra.dataset.label='Altri dettagli';
 const detail=document.createElement('details');
 const summary=node('summary','','Dettagli');detail.append(summary);
 const text=node('div','report-row-details');
 const fields=[
  ['Seconda presa',trip.secondClient?(trip.secondClient+' · '+trip.secondCity):'Non presente'],
  ['Servizi',trip.services?.length?trip.services.join(', '):'Nessuno'],
  ['Nota',trip.note||'Nessuna'],
  ['Ultima modifica',trip.updatedAt?new Date(trip.updatedAt).toLocaleString('it-IT'):'—'],
 ];
 for(const [k,v] of fields){
  const p=node('p');
  p.append(node('strong','',k+': '),document.createTextNode(String(v)));
  text.append(p);
 }
 detail.append(text);extra.append(detail);row.append(extra);
 return row;
}
function updateDriverOptions(drivers){
 const select=el('report-driver');
 const previous=select.value;
 select.replaceChildren();
 const all=node('option','','Tutti gli autisti');all.value='';select.append(all);
 for(const driver of drivers||[]){
  const option=node('option','',driver.name+(driver.active?'':' (disattivato)'));
  option.value=driver.id;select.append(option);
 }
 select.value=[...select.options].some(o=>o.value===previous)?previous:'';
}
export function setupReport(account){
 const management=el('management-panel'),report=el('report-panel');
 const views=[
  ['overview','overview-tab','Panoramica aziendale','Indicatori, andamento e anomalie dei viaggi sincronizzati.'],
  ['drivers','management-tab','Gestione autisti','Account, inviti, ripristino credenziali e autorizzazioni.'],
  ['trips','report-tab','Registro viaggi','Consulta gli inserimenti e ricerca i viaggi del periodo.'],
  ['analysis','analysis-tab','Analisi e grafici','Confronti tra autisti, clienti, località e andamento storico.'],
  ['alerts','alerts-tab','Centro anomalie','Controlla le segnalazioni generate dai viaggi sincronizzati.'],
  ['exports','exports-tab','Report PDF ed Excel','Applica i filtri ed esporta soltanto i dati autorizzati.'],
  ['security','security-tab','Sicurezza e accessi','Proteggi l’account amministratore e gestisci gli Authenticator.']
 ];
 const month=el('report-month'),driver=el('report-driver');
 month.value=currentMonth();
 let requestSeq=0,rows=[],page=null,loading=false,focusOnDriver=false;
 const insights=setupInsights(account);
 const driverSearch=el('report-driver-search');
 function selectDriver(id){
  if(driver.value===id&&page)return;
  driver.value=id;rows=[];focusOnDriver=Boolean(id);void load(false);
 }
 function tabs(view){
  const current=views.find(v=>v[0]===view)||views[1];
  const showReport=!['drivers','security'].includes(current[0]);
  management.hidden=showReport;report.hidden=!showReport;
  el('dashboard').dataset.view=current[0];
  document.title='LTS · '+current[2];
  for(const item of views){
   const button=el(item[1]),chosen=item[0]===current[0];
   button.setAttribute('aria-pressed',String(chosen));
   button.setAttribute('aria-current',chosen?'page':'false');
   button.classList.toggle('selected',chosen);
  }
  if(showReport){
   el('report-title').textContent=current[2];
   el('report-register-caption').textContent=current[0]==='trips'?
    'Viaggi sincronizzati del periodo selezionato.':'Consulta i dettagli nei filtri disponibili.';
   el('pro-title').textContent=current[0]==='alerts'?'Segnalazioni e controlli':
    current[0]==='exports'?'Report ed esportazioni':'Analisi avanzata e confronti';
  }
 }
 function reset(){
  requestSeq++;rows=[];page=null;loading=false;
  clearData();insights.reset();el('report-empty').hidden=true;el('report-status').textContent='';
  el('report-error').hidden=true;el('report-next').disabled=false;
  updateDriverOptions([]);
  driverSearch.value='';
  el('report-period-title').textContent='—';
  focusOnDriver=false;tabs('drivers');
 }
 function open(view){
  if(!account.isVerified()||account.getRole()!=='admin')return;
  if(!views.some(v=>v[0]===view))return;
  const wasReport=!report.hidden,showReport=!['drivers','security'].includes(view);
  // Never retain a one-time invite or password-reset code on another page.
  if(view!=='drivers'){
   el('secret-code').value='';
   el('secret-panel').hidden=true;
  }
  if(!showReport){
   requestSeq++;loading=false;rows=[];page=null;clearData();insights.reset();
   tabs(view);
  }else{
   tabs(view);
   if(!wasReport||(!page&&!loading)){rows=[];void load(false);}
  }
  window.scrollTo({top:0,behavior:'instant'});
 }
 async function load(append=false){
  if(report.hidden)return;
  if(!account.isVerified()||account.getRole()!=='admin'){
   reset();return;
  }
  const serial=++requestSeq;loading=true;
  el('report-refresh').disabled=true;el('report-next').disabled=true;
  if(!append){clearData();insights.reset({keepPending:true});el('report-empty').hidden=true;}
  el('report-error').hidden=true;
  el('report-status').textContent='Verifica in corso dei dati sincronizzati…';
  try{
   const result=await account.companyReport({
    month:month.value,driverId:driver.value||null,offset:append?rows.length:0,limit:40
   });
   if(serial!==requestSeq||report.hidden)return;
   if(!result||!result.summary||!Array.isArray(result.trips)||!Array.isArray(result.drivers)||
     !Array.isArray(result.chart)||!result.pagination||result.month!==month.value)
    throw new Error('Il servizio ha restituito un report incompleto.');
   rows=append?[...rows,...result.trips]:result.trips;
   page=result;
   updateDriverOptions(result.drivers);
   const summary=result.summary;
   const selected=driver.value?result.drivers.find(d=>d.id===driver.value):null;
   el('report-count').textContent=String(summary.trips);
   el('report-driver-count').textContent=String(selected?selected.days:summary.drivers);
   el('report-driver-count-label').textContent=selected?'Giorni con attività':'Autisti con viaggi';
   el('report-driver-count-note').textContent=selected?'Date con viaggi nel mese':'Con attività nel mese';
   el('report-total').textContent=currency(summary.knownTotalCents);
   el('report-missing').textContent=String(summary.missingTariffCount);
   const warnings=[];
   if(summary.missingTariffCount)warnings.push('Importi parziali: '+summary.missingTariffCount+' viaggi con tariffe mancanti.');
   if(result.incompleteArchives)warnings.push(result.incompleteArchives+' archivi non leggibili, esclusi dai totali: report incompleto.');
   el('report-warning').textContent=warnings.join(' ');
   renderDayChart(result.chart);
   renderAmountChart(result.chart);
   renderDrivers(driver.value?result.drivers.filter(item=>item.id===driver.value):result.drivers);
   driverProfile(result.drivers,driver.value);
   driverDirectory(result.drivers,driver.value,selectDriver,driverSearch.value);
   el('report-register-caption').textContent=selected?
    'Viaggi sincronizzati di '+selected.name+' nel periodo selezionato.':
    'Elenco di tutti i viaggi sincronizzati nel periodo selezionato.';
   el('report-period-title').textContent=new Intl.DateTimeFormat('it-IT',{year:'numeric',month:'long'})
    .format(new Date(Number(month.value.slice(0,4)),Number(month.value.slice(5,7))-1,1));
   el('report-rows').replaceChildren(...rows.map(tableRow));
   el('report-empty').hidden=rows.length>0;
   el('report-next').hidden=rows.length>=result.pagination.total;
   el('report-status').textContent=(result.source||'Dati sincronizzati')+
    ' Ultimo controllo: '+new Date(result.reportedAt).toLocaleString('it-IT')+'.';
   if(!append)void insights.load({month:month.value,driverId:driver.value||null,drivers:result.drivers});
   if(focusOnDriver&&selected&&el('report-driver-profile').hidden===false){
    focusOnDriver=false;
    el('report-driver-profile').scrollIntoView({block:'start',behavior:'auto'});
   }
  }catch(error){
   if(serial!==requestSeq)return;
   rows=[];page=null;clearData();
   el('report-empty').hidden=true;
   el('report-error').textContent=error?.message||'Impossibile caricare il report.';
   el('report-error').hidden=false;
   el('report-status').textContent='Report non disponibile: nessun dato confermato.';
   el('report-period-title').textContent='—';
   focusOnDriver=false;
  }finally{
   if(serial===requestSeq){loading=false;el('report-refresh').disabled=false;el('report-next').disabled=false;}
  }
 }
 for(const [view,id] of views)el(id).addEventListener('click',()=>open(view));
 for(const button of document.querySelectorAll('[data-open-section]')){
  button.addEventListener('click',()=>open(button.dataset.openSection));
 }
 el('report-refresh').addEventListener('click',()=>{rows=[];void load(false);});
 month.addEventListener('change',()=>{rows=[];void load(false);});
 driver.addEventListener('change',()=>{rows=[];focusOnDriver=Boolean(driver.value);void load(false);});
 driverSearch.addEventListener('input',()=>{
  if(page)driverDirectory(page.drivers,driver.value,selectDriver,driverSearch.value);
 });
 el('report-show-all').addEventListener('click',()=>selectDriver(''));
 el('report-reset-filters').addEventListener('click',()=>{
  month.value=currentMonth();driver.value='';driverSearch.value='';rows=[];focusOnDriver=false;void load(false);
 });
 el('report-next').addEventListener('click',()=>void load(true));
 return {reset,open};
}
