/** Authorized admin overview of the shared Maps directory and company fare coverage.
 * A successful fetch is the only source of "updated" status. Never mutate records.
 */
import {customerDirectoryStats,hasUsableAddress,selectedCustomerSites,tariffLinkedCustomerSites}
 from './customer-overview-model.mjs?v=20261107-manual-shared-v1';
import {setupMapsAddressRefresh} from './maps-address-refresh.mjs?v=20261107-maps-review-v1';

const el=id=>document.getElementById(id);
const text=(tag,cls,value)=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=String(value);return n;
};
export function setupCustomerOverview(account,onSetRate=null){
 const panel=el('customer-overview'),status=el('customer-overview-status'),
  syncStatus=el('customer-overview-sync-status');
 const filter=el('customer-overview-filter'),list=el('customer-overview-list');
 const more=el('customer-overview-more'),refresh=el('customer-overview-refresh');
 let generation=0,records=null,tariffRows=null,expanded=false;
 const mapsRefresh=setupMapsAddressRefresh(account,{onChanged:async()=>{await load();}});
 const active=()=>account.isVerified()&&account.getRole()==='admin'&&
  !el('dashboard').hidden&&!el('report-panel').hidden&&
  el('dashboard').dataset.view==='overview';
 function clearMetrics(){
  for(const key of ['total','complete','missing','percent','priced','unpriced'])
   el('customer-overview-'+key).textContent='—';
  el('customer-overview-progress').style.width='0%';
  el('customer-overview-progress').setAttribute('aria-valuenow','0');
 }
 function reset(){
  mapsRefresh.reset();
  generation++;records=null;tariffRows=null;expanded=false;
  filter.value='incomplete';list.replaceChildren();clearMetrics();
  el('customer-overview-caption').textContent='La presenza di un indirizzo non ne certifica la validità su Google Maps.';
  status.textContent='Apri la panoramica per aggiornare il catalogo condiviso.';
  syncStatus.textContent='Clienti e tariffe non ancora sincronizzati.';
  el('customer-overview-matching').textContent='Nessun dato confermato';
  more.hidden=true;refresh.disabled=false;
 }
 function render(){
  if(!records)return;
  const mapSites=records.filter(site=>site.source!=='manual');
  const metrics=customerDirectoryStats(mapSites);
  const manualCount=records.length-mapSites.length;
  const linked=tariffRows?tariffLinkedCustomerSites(records,tariffRows):null;
  el('customer-overview-total').textContent=String(records.length);
  el('customer-overview-complete').textContent=String(metrics.complete);
  el('customer-overview-missing').textContent=String(metrics.incomplete);
  el('customer-overview-percent').textContent=metrics.coverage+'%';
  el('customer-overview-priced').textContent=linked?String(linked.priced):'—';
  el('customer-overview-unpriced').textContent=linked?String(linked.unpriced):'—';
  el('customer-overview-progress').style.width=metrics.coverage+'%';
  el('customer-overview-progress').setAttribute('aria-valuenow',String(metrics.coverage));
  el('customer-overview-caption').textContent=
   metrics.complete+' sedi Maps con indirizzo su '+metrics.total+
   ' · '+manualCount+' clienti manuali (indirizzo facoltativo).';
  const shown=selectedCustomerSites(records,filter.value);
  const pricedSites=new Set(linked?.sites.filter(site=>site.hasRate).map(site=>site.name+'\u0000'+site.city)||[]);
  list.replaceChildren();
  const limit=expanded?shown.length:8;
  if(!shown.length)list.append(text('p','customer-directory-empty',
   metrics.total?'Nessuna sede in questa categoria.':'Nessuna sede condivisa disponibile.'));
  for(const row of shown.slice(0,limit)){
   const card=document.createElement('article');
   card.className='customer-directory-site';
   const body=document.createElement('div');body.className='customer-directory-site-info';
   body.append(text('strong','customer-directory-site-name',row.name),
    text('span','customer-directory-city',row.city));
   const valid=hasUsableAddress(row.address);
   const isManual=row.source==='manual';
   body.append(text('span','customer-directory-address',
    valid?row.address:isManual?'Indirizzo facoltativo':'Indirizzo stradale da completare'));
   const chip=text('span',isManual?'customer-directory-chip is-present':
    valid?'customer-directory-chip is-present':'customer-directory-chip is-missing',
    isManual?'Cliente manuale':valid?'Indirizzo registrato':'Da completare');
   const actions=document.createElement('div');actions.className='customer-directory-site-actions';
   if(row.mapsUrl){
    const link=document.createElement('a');
    link.className='customer-directory-maps';link.textContent='Apri Maps';
    link.href=row.mapsUrl;link.target='_blank';link.rel='noopener noreferrer';
    link.setAttribute('aria-label','Apri Google Maps per '+row.name+', '+row.city);
    actions.append(link);
   }
   if(typeof onSetRate==='function'){
    const setRate=document.createElement('button');
    setRate.className='button outline customer-directory-set-rate';
    setRate.type='button';
    const assigned=pricedSites.has(row.name+'\u0000'+row.city);
    setRate.textContent=tariffRows===null?'Vai alle tariffe':assigned?'Modifica tariffa':'Imposta tariffa';
    setRate.setAttribute('aria-label',setRate.textContent+' per '+row.name+', '+row.city);
    setRate.addEventListener('click',()=>{if(active())onSetRate(row);});
    actions.append(setRate);
   }
   card.append(body,chip,actions);list.append(card);
  }
  more.hidden=shown.length<=8;
  more.textContent=expanded?'Mostra meno':'Mostra tutte le '+shown.length+' sedi';
  el('customer-overview-matching').textContent=
   shown.length+' sedi'+(filter.value==='incomplete'?' con indirizzo incompleto':
    filter.value==='complete'?' con indirizzo registrato':
    filter.value==='manual'?' inseriti manualmente':' nell’archivio condiviso');
 }
 async function load({silent=false}={}){
  if(!active()){reset();return false;}
  const token=++generation;
  refresh.disabled=true;
  if(!silent){
   more.hidden=true;list.replaceChildren();
   status.textContent='Sincronizzazione di clienti e tariffe aziendali…';
  }
  const [customersResult,ratesResult]=await Promise.allSettled([
   import('../shared-maps-client.mjs').then(module=>module.sharedMapsCustomers()),
   account.companyTariffs('list')
  ]);
  if(token!==generation||!active())return false;
  const validCustomers=customersResult.status==='fulfilled'&&Array.isArray(customersResult.value);
  const validTariffs=ratesResult.status==='fulfilled'&&Array.isArray(ratesResult.value?.tariffs);
  if(validCustomers){
   const next=customersResult.value;
   const rates=validTariffs?ratesResult.value.tariffs:null;
   const changed=JSON.stringify(records)!==JSON.stringify(next)||
    JSON.stringify(tariffRows)!==JSON.stringify(rates);
   records=next;tariffRows=rates;
   if(changed||!silent)render();
   const clock=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
   status.textContent='Elenco clienti Supabase sincronizzato alle '+clock+
    '. Questo controllo NON rilegge Google Maps: per gli indirizzi segnaposto usa Verifica i link già associati.';
   const linked=validTariffs?tariffLinkedCustomerSites(records,tariffRows):null;
   syncStatus.textContent=linked?
    'Clienti e tariffe aggiornati alle '+clock+' · '+linked.priced+' sedi con tariffa, '+
    linked.unpriced+' senza tariffa su '+linked.total+'.':
    'Clienti aggiornati, ma le tariffe non sono state recuperate. I dati economici non sono confermati.';
  }else{
   // A failed background refresh must not erase the last verified customer list.
   if(!silent||!records){records=null;tariffRows=null;list.replaceChildren();clearMetrics();}
   status.textContent=records?
    'Aggiornamento clienti non riuscito: l’elenco visualizzato è l’ultimo dato disponibile.':
    'Clienti aziendali non disponibili. Riprova con Internet attivo.';
   syncStatus.textContent='Sincronizzazione non completa: verifica la connessione e premi Aggiorna clienti.';
  }
  if(token===generation)refresh.disabled=false;
  return validCustomers&&validTariffs;
 }
 filter.addEventListener('change',()=>{expanded=false;render();});
 more.addEventListener('click',()=>{expanded=!expanded;render();});
 refresh.addEventListener('click',()=>{void load();});
 reset();
 return {load,reset};
}
