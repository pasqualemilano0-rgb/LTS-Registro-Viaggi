/** LTS Pro V3 — advanced read-only company dashboard. All data from the AAL2 protected backend. */
import {downloadPdf,downloadXlsx} from './report-export.mjs?v=20261104-company-v3';
const el=id=>document.getElementById(id);
const dom=(name,cls='',value='')=>{
 const n=document.createElement(name);if(cls)n.className=cls;n.textContent=String(value);return n;
};
const money=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat('it-IT',
 {style:'currency',currency:'EUR'}).format(n/100):'—';
const percent=(current,previous)=>{
 if(!Number.isFinite(current)||!Number.isFinite(previous))return '—';
 if(previous===0)return current===0?'—':'Nuova attività';
 const value=Math.round((current-previous)/previous*100);
 return (value>0?'+':'')+value+'%';
};
const first=m=>m+'-01';
const last=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
const monthLabel=m=>new Intl.DateTimeFormat('it-IT',{month:'short',year:'2-digit'})
 .format(new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7))-1,1)));
const safeTitle=s=>String(s||'').slice(0,180);
function options(id,all,value,label){
 const select=el(id);select.replaceChildren();
 const none=dom('option','',label);none.value='';select.append(none);
 for(const item of all){
  const o=dom('option','',item);o.value=item;select.append(o);
 }
 select.value=[...select.options].some(o=>o.value===value)?value:'';
}
function makeSVG(tag,attrs={}){
 const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [name,value] of Object.entries(attrs))n.setAttribute(name,String(value));
 return n;
}
function empty(id,label='Non ci sono dati per i filtri selezionati.'){
 el(id).replaceChildren(dom('p','pro-empty',label));
}
function renderTrend(data,mode,changeMonth){
 const values=data.monthly||[],alt=data.compareMonthly||[];
 const host=el('pro-trend');host.replaceChildren();
 const actions=el('pro-trend-months');actions.replaceChildren();
 if(!values.length){empty('pro-trend');return;}
 const accessor=x=>mode==='trips'?x.trips:x.totalCents;
 const max=Math.max(1,...values.map(accessor),...alt.map(accessor));
 const svg=makeSVG('svg',{viewBox:'0 0 660 215',role:'img',
  'aria-label':'Andamento di '+(mode==='trips'?'numero dei viaggi':'valore delle trasferte')+' negli ultimi 12 mesi'});
 const left=24,top=18,width=612,height=166;
 for(let j=0;j<5;j++){
  const y=top+j*(height/4);
  svg.append(makeSVG('line',{x1:left,y1:y,x2:left+width,y2:y,class:'pro-trend-grid'}));
 }
 function points(list){
  return list.map((d,i)=>[left+i*width/(values.length-1),top+height-(accessor(d)/max*height)]);
 }
 const pts=points(values);
 const path=makeSVG('polyline',{points:pts.map(x=>x.join(',')).join(' '),class:'pro-trend-primary'});
 svg.append(path);
 for(const [x,y] of pts)svg.append(makeSVG('circle',{cx:x,cy:y,r:4.2,class:'pro-trend-dot'}));
 if(alt.length===values.length){
  svg.append(makeSVG('polyline',{points:points(alt).map(x=>x.join(',')).join(' '),class:'pro-trend-secondary'}));
 }
 host.append(svg);
 for(const month of values){
  const b=dom('button','pro-month-button');
  b.type='button';b.setAttribute('aria-pressed',String(month.month===data.month));
  b.setAttribute('aria-label','Analizza '+monthLabel(month.month));
  b.append(dom('span','',monthLabel(month.month)),
    dom('small','',mode==='trips'?String(month.trips):money(month.totalCents)));
  b.addEventListener('click',()=>changeMonth(month.month));
  actions.append(b);
 }
}
function renderBreakdown(id,rows,onChoose){
 const root=el(id);root.replaceChildren();
 if(!rows?.length){empty(id);return;}
 const max=Math.max(1,...rows.map(x=>x.count));
 for(const item of rows){
  const btn=dom('button','pro-bar');btn.type='button';
  btn.setAttribute('aria-label','Filtra per '+item.name+', '+item.count+' viaggi');
  const progress=document.createElement('progress');progress.max=max;progress.value=item.count;
  btn.append(dom('span','',safeTitle(item.name)),progress,dom('strong','',item.count));
  btn.addEventListener('click',()=>onChoose(item.name));
  root.append(btn);
 }
}
function renderAlerts(data,onChoose){
 const root=el('pro-alerts');root.replaceChildren();
 el('pro-alert-count').textContent=String(data.alertTotal||0);
 if(!data.alerts.length){root.append(dom('p','pro-empty','Nessuna anomalia rilevata nei dati controllati.'));return;}
 for(const a of data.alerts){
  const selectable=Boolean(a.driverId);
  const b=dom(selectable?'button':'div','pro-alert-item');
  if(selectable){b.type='button';b.dataset.selectable='true';b.addEventListener('click',()=>onChoose(a));}
  b.dataset.severity=a.severity==='warning'?'warning':'info';
  const icon=dom('span','pro-alert-icon',a.severity==='warning'?'!':'i');
  icon.setAttribute('aria-hidden','true');
  const t=dom('div');t.append(dom('strong','',safeTitle(a.detail)),
   dom('small','',(a.driverName||'Controllo aziendale')+(a.date?' · '+a.date:'')));
  b.append(icon,t);root.append(b);
 }
 if(data.alertTotal>data.alerts.length)
  root.append(dom('p','pro-empty','Altre '+(data.alertTotal-data.alerts.length)+' segnalazioni non visualizzate.'));
}
function renderCompare(data){
 const root=el('pro-compare-output');root.replaceChildren();
 const drivers=data.drivers||[];
 if(drivers.length!==2){
  root.append(dom('p','',data.selection.driverId?
   'Seleziona un secondo autista per confrontare lo stesso mese.':
   'Seleziona prima un autista nel cruscotto, poi scegli il secondo per confrontare attività e valori.'));
  return;
 }
 const t=document.createElement('table');t.className='pro-compare-table';
 const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const h of ['Autista','Viaggi','Valore registrato'])tr.append(dom('th','',h));
 head.append(tr);t.append(head);
 const body=document.createElement('tbody');
 for(const d of drivers){
  const row=document.createElement('tr');
  row.append(dom('td','',safeTitle(d.name)),dom('td','',d.trips),dom('td','',money(d.totalCents)));
  body.append(row);
 }
 t.append(body);root.append(t);
}
function renderRecords(data,visible){
 const host=el('pro-records');host.replaceChildren();
 const rows=data.records||[];
 el('pro-record-count').textContent=rows.length+' viaggi';
 if(!rows.length){host.append(dom('p','pro-empty','Nessun viaggio corrisponde a questi filtri.'));return;}
 for(const r of rows.slice(0,visible)){
  const box=dom('article','pro-record'),head=dom('div','pro-record-head');
  head.append(dom('strong','',safeTitle(r.driverName)),dom('time','',r.date));
  const body=dom('div','pro-record-body');
  body.append(dom('span','',safeTitle(r.container)+' · '+safeTitle(r.client)+' / '+safeTitle(r.city)),
   dom('b','',money(r.amountCents)));
  box.append(head,body);
  if(r.missingTariff)box.append(dom('span','pro-record-warning','Tariffa da completare · importo parziale'));
  host.append(box);
 }
 el('pro-show-more').hidden=visible>=rows.length;
}
function validateData(d,month){
 if(!d||d.month!==month||!Array.isArray(d.records)||!Array.isArray(d.monthly)||
  !Array.isArray(d.clients)||!Array.isArray(d.routes)||!Array.isArray(d.alerts)||
  !d.summary||!d.currentMonth||!d.previousMonth||d.monthly.length!==12||
  !Number.isSafeInteger(d.summary.trips)||d.records.length!==d.summary.trips||
  !Number.isSafeInteger(d.summary.totalCents))
  throw Error('L’API ha restituito dati di analisi incompleti.');
 return d;
}
export function setupInsights(account){
 let state=null,seq=0,currentMonth='',driverId='',drivers=[],visible=30;
 const monthEl=el('report-month'),driverEl=el('report-driver');
 const compare=el('pro-compare-driver');
 const from=el('pro-from'),to=el('pro-to');
 const client=el('pro-client'),city=el('pro-city'),container=el('pro-container');
 const buttonIds=['pro-export-pdf','pro-export-xlsx'];
 const lock=locked=>buttonIds.forEach(id=>el(id).disabled=locked);
 function clear(){
  seq++;state=null;lock(true);visible=30;
  for(const id of ['pro-trend','pro-trend-months','pro-clients','pro-routes','pro-alerts',
                   'pro-records','pro-compare-output'])el(id).replaceChildren();
  for(const id of ['pro-delta-trips','pro-delta-value','pro-alert-count','pro-record-count'])
   el(id).textContent='—';
  el('pro-progress').textContent='';el('pro-error').hidden=true;
  el('pro-filter-summary').textContent='';
  el('pro-export-status').textContent='';
  el('pro-show-more').hidden=true;
 }
 function chooseMonth(month){
  monthEl.value=month;monthEl.dispatchEvent(new Event('change',{bubbles:true}));
  monthEl.scrollIntoView({block:'center',behavior:'auto'});
 }
 function chosenAlerts(item){
  if(item.driverId&&driverEl.value!==item.driverId){
   driverEl.value=item.driverId;
   driverEl.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if(item.date&&item.date>=from.min&&item.date<=to.max){
   from.value=item.date;to.value=item.date;
  }
 }
 function changedContext(ctx){
  const sameMonth=currentMonth===ctx.month;
  const originalCompare=compare.value;
  driverId=ctx.driverId||'';currentMonth=ctx.month;
  drivers=Array.isArray(ctx.drivers)?ctx.drivers:[];
  if(!sameMonth){
   from.value=first(ctx.month);to.value=last(ctx.month);container.value='';
   client.value='';city.value='';compare.value='';
  }
  const d=drivers.filter(x=>x.id!==driverId);
  compare.replaceChildren();
  const none=dom('option','','Nessun confronto');none.value='';compare.append(none);
  for(const item of d){const opt=dom('option','',item.name);opt.value=item.id;compare.append(opt);}
  compare.value=driverId&&d.some(x=>x.id===originalCompare)?originalCompare:'';
  const earliest=new Date(Date.UTC(Number(ctx.month.slice(0,4)),Number(ctx.month.slice(5,7))-12,1))
   .toISOString().slice(0,10);
  from.min=earliest;from.max=last(ctx.month);to.min=earliest;to.max=last(ctx.month);
  if(from.value<earliest||from.value>from.max)from.value=first(ctx.month);
  if(to.value>to.max||to.value<to.min)to.value=last(ctx.month);
 }
 function render(data){
  state=data;visible=30;lock(false);
  el('pro-progress').textContent='Analisi aggiornata alle '+new Date(data.reportedAt).toLocaleString('it-IT')+
   '. Dati sincronizzati, consultazione riservata.';
  const old=data.previousMonth,now=data.currentMonth;
  el('pro-delta-trips').textContent=percent(now.trips,old.trips);
  el('pro-delta-value').textContent=percent(now.totalCents,old.totalCents);
  el('pro-delta-trips').dataset.trend=now.trips<old.trips?'negative':'neutral';
  el('pro-delta-value').dataset.trend=now.totalCents<old.totalCents?'negative':'neutral';
  el('pro-previous-caption').textContent='Mese completo: '+monthLabel(old.month)+
   '. Non include i filtri di ricerca personalizzati.';
  renderTrend(data,el('pro-trend-metric').value,chooseMonth);
  renderCompare(data);
  options('pro-client',data.options?.clients||[],client.value,'Tutti i clienti');
  options('pro-city',data.options?.cities||[],city.value,'Tutte le località');
  renderBreakdown('pro-clients',data.clients,name=>{client.value=name;void load();});
  renderBreakdown('pro-routes',data.routes,name=>{city.value=name;void load();});
  renderAlerts(data,chosenAlerts);
  renderRecords(data,visible);
  el('pro-filter-summary').textContent='Selezione: '+data.range.fromDate+' – '+data.range.toDate+
   ', '+data.summary.trips+' viaggi, '+money(data.summary.totalCents)+
   ' registrati'+(data.partial?' · Attenzione: dati parziali.':'.');
 }
 async function load(){
  if(!account.isVerified()||account.getRole()!=='admin'||el('report-panel').hidden){clear();return;}
  const index=++seq;state=null;lock(true);
  el('pro-error').hidden=true;el('pro-progress').textContent='Analisi aziendale in aggiornamento…';
  try{
   if(!from.value||!to.value||from.value>to.value)throw Error('Controlla le date del periodo.');
   const result=validateData(await account.companyInsights({
    month:currentMonth,driverId:driverId||null,compareDriverId:compare.value||null,
    fromDate:from.value,toDate:to.value,client:client.value,city:city.value,
    container:container.value.trim()
   }),currentMonth);
   if(index!==seq||el('report-panel').hidden)return;
   render(result);
  }catch(error){
   if(index!==seq)return;
   clear();
   el('pro-error').textContent=error?.message||'Analisi non disponibile.';
   el('pro-error').hidden=false;
   el('pro-progress').textContent='Analisi non disponibile: nessun dato confermato.';
  }
 }
 function reset(){
  clear();currentMonth='';driverId='';drivers=[];
  compare.replaceChildren();from.value='';to.value='';client.replaceChildren();city.replaceChildren();
  container.value='';
 }
 el('pro-trend-metric').addEventListener('change',()=>{if(state)renderTrend(state,el('pro-trend-metric').value,chooseMonth);});
 compare.addEventListener('change',()=>{if(driverId)void load();else compare.value='';});
 el('pro-apply').addEventListener('click',()=>void load());
 el('pro-clear').addEventListener('click',()=>{
  from.value=first(currentMonth);to.value=last(currentMonth);
  client.value='';city.value='';container.value='';compare.value='';void load();
 });
 el('pro-show-more').addEventListener('click',()=>{if(state){visible+=30;renderRecords(state,visible);}});
 for(const [button,kind] of [['pro-export-pdf','pdf'],['pro-export-xlsx','xlsx']]){
  el(button).addEventListener('click',()=>{
   if(!state||!account.isVerified()||account.getRole()!=='admin'){
    el('pro-export-status').textContent='Sessione non verificata: impossibile esportare.';return;
   }
   try{
    if(kind==='pdf')downloadPdf(state);else downloadXlsx(state);
    el('pro-export-status').textContent='Report '+kind.toUpperCase()+
     ' generato localmente. Contiene esclusivamente i dati filtrati confermati.';
   }catch(err){el('pro-export-status').textContent='Esportazione non riuscita: '+(err?.message||'errore');}
  });
 }
 reset();
 return {load:ctx=>{changedContext(ctx);return load();},reset};
}
