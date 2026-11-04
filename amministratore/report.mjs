/** Administrator reporting UI. Aggregates are authoritative only when returned by the API. */
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
 for(const id of ['report-chart','report-driver-chart','report-rows'])el(id).replaceChildren();
 for(const id of ['report-count','report-driver-count','report-total','report-missing'])el(id).textContent='—';
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
function tableRow(trip){
 const row=document.createElement('tr');
 const cell=value=>{const td=node('td','',value);row.append(td);return td;};
 cell(trip.driverName);
 cell(dateLabel(trip.date));
 cell(trip.container);
 const route=cell(trip.client);
 route.append(node('small','report-muted',trip.city||''));
 const amount=cell(currency(trip.totalCents));
 if(trip.missingTariff)amount.append(node('span','report-partial','Parziale · tariffa mancante'));
 const extra=document.createElement('td');
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
 const mTab=el('management-tab'),rTab=el('report-tab');
 const month=el('report-month'),driver=el('report-driver');
 month.value=currentMonth();
 let requestSeq=0,rows=[],page=null,loading=false;
 function tabs(showReport){
  management.hidden=showReport;report.hidden=!showReport;
  mTab.setAttribute('aria-pressed',String(!showReport));
  rTab.setAttribute('aria-pressed',String(showReport));
  mTab.classList.toggle('selected',!showReport);
  rTab.classList.toggle('selected',showReport);
 }
 function reset(){
  requestSeq++;rows=[];page=null;loading=false;
  clearData();el('report-empty').hidden=true;el('report-status').textContent='';
  el('report-error').hidden=true;el('report-next').disabled=false;
  updateDriverOptions([]);tabs(false);
 }
 async function load(append=false){
  if(report.hidden)return;
  if(!account.isVerified()||account.getRole()!=='admin'){
   reset();return;
  }
  const serial=++requestSeq;loading=true;
  el('report-refresh').disabled=true;el('report-next').disabled=true;
  if(!append){clearData();el('report-empty').hidden=true;}
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
   el('report-count').textContent=String(summary.trips);
   el('report-driver-count').textContent=String(summary.drivers);
   el('report-total').textContent=currency(summary.knownTotalCents);
   el('report-missing').textContent=String(summary.missingTariffCount);
   const warnings=[];
   if(summary.missingTariffCount)warnings.push('Importi parziali: '+summary.missingTariffCount+' viaggi con tariffe mancanti.');
   if(result.incompleteArchives)warnings.push(result.incompleteArchives+' archivi non leggibili, esclusi dai totali: report incompleto.');
   el('report-warning').textContent=warnings.join(' ');
   renderDayChart(result.chart);renderDrivers(result.drivers);
   el('report-rows').replaceChildren(...rows.map(tableRow));
   el('report-empty').hidden=rows.length>0;
   el('report-next').hidden=rows.length>=result.pagination.total;
   el('report-status').textContent=(result.source||'Dati sincronizzati')+
    ' Ultimo controllo: '+new Date(result.reportedAt).toLocaleString('it-IT')+'.';
  }catch(error){
   if(serial!==requestSeq)return;
   rows=[];page=null;clearData();
   el('report-empty').hidden=true;
   el('report-error').textContent=error?.message||'Impossibile caricare il report.';
   el('report-error').hidden=false;
   el('report-status').textContent='Report non disponibile: nessun dato confermato.';
  }finally{
   if(serial===requestSeq){loading=false;el('report-refresh').disabled=false;el('report-next').disabled=false;}
  }
 }
 mTab.addEventListener('click',()=>{requestSeq++;loading=false;rows=[];page=null;clearData();tabs(false);});
 rTab.addEventListener('click',()=>{if(!account.isVerified()||account.getRole()!=='admin')return;tabs(true);void load(false);});
 el('report-refresh').addEventListener('click',()=>{rows=[];void load(false);});
 month.addEventListener('change',()=>{rows=[];void load(false);});
 driver.addEventListener('change',()=>{rows=[];void load(false);});
 el('report-next').addEventListener('click',()=>void load(true));
 return {reset};
}
