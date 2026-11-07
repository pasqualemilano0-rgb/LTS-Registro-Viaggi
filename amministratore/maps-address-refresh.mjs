/** Admin-only batch review of EXISTING linked Maps places.
 * Reads proposals but performs no writes until an MFA-verified admin explicitly
 * selects rows and approves them. The shared API owns deduplication.
 */
import {readMapsCustomer} from '../maps-reader-client.mjs';
import {sharedMapsCustomers,saveSharedMapsCustomer} from '../shared-maps-client.mjs';
import {isMissingMapsAddress,reviewLinkedMapsAddress} from '../shared/maps-address-review.mjs';

const get=id=>document.getElementById(id);
const make=(tag,cls,text)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);return el;
};
export function setupMapsAddressRefresh(account,{onChanged=async()=>{}}={}){
 const scan=get('customer-maps-scan'),apply=get('customer-maps-apply'),
  status=get('customer-maps-refresh-status'),list=get('customer-maps-results'),
  selectAll=get('customer-maps-select-all'),preview=get('customer-maps-preview');
 let generation=0,working=false,rows=[],controllers=new Set(),selected=new Set();
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !get('dashboard').hidden&&get('dashboard').dataset.view==='overview'&&
  !get('report-panel').hidden;
 function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 function controls(){
  scan.disabled=working;
  apply.disabled=working||selected.size===0;
  selectAll.disabled=working||!rows.some(row=>row.review?.eligible&&!row.saved);
  selectAll.checked=rows.some(row=>row.review?.eligible&&!row.saved)&&
   rows.filter(row=>row.review?.eligible&&!row.saved).every(row=>selected.has(row.site.mapsUrl));
 }
 function reset(){
  generation++;for(const controller of controllers)controller.abort();controllers.clear();
  working=false;rows=[];selected.clear();list.replaceChildren();preview.hidden=true;
  message('I link sono già collegati: premi Verifica link per controllare quali indirizzi Google Maps possono essere recuperati.');
  controls();
 }
 function render(){
  list.replaceChildren();
  const sorted=[...rows].sort((a,b)=>Number(Boolean(b.review?.eligible&&!b.saved))-
   Number(Boolean(a.review?.eligible&&!a.saved))||
   a.site.name.localeCompare(b.site.name,'it'));
  for(const row of sorted){
   const item=make('article','customer-maps-result');
   const meta=make('div','customer-maps-result-main');
   meta.append(make('strong','',row.site.name),
    make('span','',row.site.city));
   const line=make('span','customer-maps-result-detail',
    row.saved?'Indirizzo aggiornato: '+row.review.address:
    row.review?.eligible?'Proposta: '+row.review.address:
     row.reason||row.review?.reason||'Lettura in corso…');
   meta.append(line);
   if(row.review?.eligible&&!row.saved){
    const choice=make('label','customer-maps-choice');
    const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(row.site.mapsUrl);
    input.disabled=working;input.setAttribute('aria-label','Conferma indirizzo proposto per '+row.site.name);
    input.addEventListener('change',()=>{
     if(input.checked)selected.add(row.site.mapsUrl);else selected.delete(row.site.mapsUrl);
     controls();
    });
    choice.append(input,make('span','','Seleziona'));item.append(meta,choice);
   }else{
    item.append(meta,make('span','customer-maps-result-state',
     row.saved?'Aggiornato':'Da verificare'));
   }
   list.append(item);
  }
  controls();
 }
 async function verify(){
  if(working||!authorized())return;
  const seq=++generation,owner=account.getAccountId();
  for(const controller of controllers)controller.abort();controllers.clear();
  selected.clear();rows=[];working=true;preview.hidden=false;
  list.replaceChildren();controls();
  message('Lettura dei collegamenti Google Maps esistenti… Nessun cliente viene modificato.');
  try{
   const sites=await sharedMapsCustomers();
   if(seq!==generation||!authorized()||owner!==account.getAccountId())return;
   const targets=sites.filter(site=>isMissingMapsAddress(site)&&site.mapsUrl);
   if(!targets.length){
    message('Tutti i clienti collegati hanno già un indirizzo registrato.');
    return;
   }
   // Two workers avoid overwhelming Google with simultaneous shortlink reads.
   const outcomes=new Array(targets.length);let cursor=0,done=0;
   async function worker(){
    while(cursor<targets.length&&seq===generation&&authorized()&&owner===account.getAccountId()){
     const index=cursor++,site=targets[index];
     const controller=new AbortController();controllers.add(controller);
     let row;
     try{
      const proposal=await readMapsCustomer(site.mapsUrl,{signal:controller.signal});
      const review=reviewLinkedMapsAddress(site,proposal);
      row={site,review,reason:review.eligible?'':review.reason,saved:false};
     }catch(error){
      row={site,review:null,
       reason:error?.name==='AbortError'?'Lettura interrotta.':
        (error?.message||'Impossibile leggere il link Google Maps.'),saved:false};
     }finally{controllers.delete(controller);}
     if(seq!==generation||!authorized()||owner!==account.getAccountId())return;
     outcomes[index]=row;done++;
     rows=outcomes.filter(Boolean);
     const ready=rows.filter(item=>item.review?.eligible).length;
     message('Link verificati: '+done+' di '+targets.length+' · '+
      ready+' indirizzi da controllare · '+(done-ready)+' non aggiornabili automaticamente. '+
      'Nessun dato è stato ancora modificato.');
     // Do not rerender on each result while somebody is selecting checkboxes.
     if(done===targets.length||done%3===0)render();
    }
   }
   await Promise.all([worker(),worker()]);
   if(seq!==generation||!authorized()||owner!==account.getAccountId())return;
   rows=outcomes.filter(Boolean);render();
   const ready=rows.filter(row=>row.review?.eligible).length;
   message('Verifica terminata: '+ready+' di '+rows.length+
    ' indirizzi proposti. Controlla le sedi e seleziona solo quelle corrette. '+
    'I link, i nomi dei clienti e le tariffe restano invariati.');
  }catch(error){
   if(seq===generation&&authorized())message(error?.message||'Verifica dei link non riuscita.',true);
  }finally{if(seq===generation){working=false;render();}}
 }
 async function saveApproved(){
  if(working||!authorized()||!selected.size)return;
  const ids=[...selected];const seq=generation,owner=account.getAccountId();
  if(!window.confirm('Aggiornare gli indirizzi delle '+ids.length+' sedi selezionate? '+
   'I dati già completi, i link e tutte le tariffe rimarranno invariati.'))return;
  working=true;controls();
  let saved=0,skipped=0,failures=0,quota=false;
  try{
   // Re-read latest company list to avoid changing sites altered after preview.
   const latest=await sharedMapsCustomers();
   const live=new Map(latest.map(site=>[site.mapsUrl,site]));
   for(const url of ids){
    if(seq!==generation||!authorized()||owner!==account.getAccountId())break;
    const row=rows.find(item=>item.site.mapsUrl===url);
    const site=live.get(url);
    if(!row||!site||site.name!==row.site.name||site.city!==row.site.city||
       !isMissingMapsAddress(site)||!row.review?.eligible||
       !reviewLinkedMapsAddress(site,{...row.site,
        address:row.review.address,mapsUrl:url}).eligible){
     skipped++;selected.delete(url);continue;
    }
    // The shared service only upgrades a placeholder at the SAME Maps URL.
    try{
     const result=await saveSharedMapsCustomer(url,{
      name:site.name,city:site.city,address:row.review.address
     });
     if(result.created||!result.updated||result.customer.mapsUrl!==url||
        result.customer.address.toLocaleUpperCase('it-IT')!==
         row.review.address.toLocaleUpperCase('it-IT')){
      failures++;row.reason='L’indirizzo non è stato confermato dal registro aziendale.';
     }else{
      saved++;row.saved=true;selected.delete(url);
      live.set(url,{...site,address:result.customer.address});
     }
    }catch(error){
     failures++;row.reason=error?.message||'Salvataggio non riuscito.';
     if(error?.status===429){quota=true;break;}
    }
    message('Aggiornamento indirizzi: '+saved+' confermati, '+skipped+
     ' saltati, '+failures+' non riusciti.');
   }
   if(seq===generation&&authorized()){
    if(saved)try{await onChanged();}catch{}
    message('Verifica salvataggio: '+saved+' indirizzi aggiornati, '+
     skipped+' saltati, '+failures+' non riusciti.'+
     (quota?' Limite giornaliero del registro Maps raggiunto: riprova un altro giorno.':'')+
     ' Gli indirizzi non confermati restano da completare.',
     failures>0||quota);
   }
  }catch(error){
   if(seq===generation&&authorized())message(error?.message||'Aggiornamento non completato.',true);
  }finally{if(seq===generation){working=false;render();}}
 }
 selectAll.addEventListener('change',()=>{
  if(working)return;
  selected.clear();
  if(selectAll.checked)for(const row of rows)
   if(row.review?.eligible&&!row.saved)selected.add(row.site.mapsUrl);
  render();
 });
 scan.addEventListener('click',()=>void verify());
 apply.addEventListener('click',()=>void saveApproved());
 reset();
 return {reset};
}
