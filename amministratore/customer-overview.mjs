/** Admin-only read-only overview. No customer data is kept in browser storage. */
// Load the authenticated company catalog only after the overview is opened.
import {customerDirectoryStats,hasUsableAddress,selectedCustomerSites} from './customer-overview-model.mjs?v=20261107-client-tariff-sync-v2';
const el=id=>document.getElementById(id);
const text=(tag,cls,value)=>{
  const n=document.createElement(tag);n.className=cls;n.textContent=value;return n;
};
export function setupCustomerOverview(account,onSetRate=null){
  const panel=el('customer-overview'),status=el('customer-overview-status');
  const filter=el('customer-overview-filter'),list=el('customer-overview-list');
  const more=el('customer-overview-more'),refresh=el('customer-overview-refresh');
  let generation=0,records=null,expanded=false;
  const active=()=>account.isVerified()&&account.getRole()==='admin'&&
    !el('dashboard').hidden&&!el('report-panel').hidden&&
    el('dashboard').dataset.view==='overview';
  function reset(){
    generation++;records=null;expanded=false;
    filter.value='incomplete';list.replaceChildren();
    for(const key of ['total','complete','missing','percent'])
      el('customer-overview-'+key).textContent='—';
    el('customer-overview-progress').style.width='0%';
    el('customer-overview-progress').setAttribute('aria-valuenow','0');
    el('customer-overview-caption').textContent='La presenza di un indirizzo non ne certifica la validità su Google Maps.';
    status.textContent='Apri la panoramica per aggiornare il catalogo condiviso.';
    el('customer-overview-matching').textContent='Nessun dato confermato';
    more.hidden=true;refresh.disabled=false;
  }
  function render(){
    if(!records)return;
    const metrics=customerDirectoryStats(records);
    el('customer-overview-total').textContent=String(metrics.total);
    el('customer-overview-complete').textContent=String(metrics.complete);
    el('customer-overview-missing').textContent=String(metrics.incomplete);
    el('customer-overview-percent').textContent=metrics.coverage+'%';
    el('customer-overview-progress').style.width=metrics.coverage+'%';
    el('customer-overview-progress').setAttribute('aria-valuenow',String(metrics.coverage));
    el('customer-overview-caption').textContent=
      metrics.complete+' sedi con un indirizzo registrato su '+metrics.total+
      '. Per la verifica del punto di carico consulta la scheda Maps.';
    const shown=selectedCustomerSites(records,filter.value);
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
      body.append(text('span','customer-directory-address',
        valid?row.address:'Indirizzo stradale da completare'));
      const chip=text('span',valid?'customer-directory-chip is-present':'customer-directory-chip is-missing',
        valid?'Indirizzo registrato':'Da completare');
      const link=document.createElement('a');
      link.className='customer-directory-maps';link.textContent='Apri Maps';
      link.href=row.mapsUrl;link.target='_blank';link.rel='noopener noreferrer';
      link.setAttribute('aria-label','Apri Google Maps per '+row.name+', '+row.city);
      const actions=document.createElement('div');actions.className='customer-directory-site-actions';
      actions.append(link);
      if(typeof onSetRate==='function'){
        const setRate=document.createElement('button');
        setRate.className='button outline customer-directory-set-rate';
        setRate.type='button';setRate.textContent='Imposta tariffa';
        setRate.setAttribute('aria-label','Imposta tariffa per '+row.name+', '+row.city);
        setRate.addEventListener('click',()=>{
          if(active())onSetRate(row);
        });
        actions.append(setRate);
      }
      card.append(body,chip,actions);list.append(card);
    }
    more.hidden=shown.length<=8;
    more.textContent=expanded?'Mostra meno':'Mostra tutte le '+shown.length+' sedi';
    el('customer-overview-matching').textContent=
      shown.length+' sedi'+(filter.value==='incomplete'?' con indirizzo incompleto':
        filter.value==='complete'?' con indirizzo registrato':' nell’archivio condiviso');
  }
  async function load(){
    if(!active()){reset();return;}
    const token=++generation;records=null;expanded=false;
    refresh.disabled=true;more.hidden=true;list.replaceChildren();
    status.textContent='Caricamento sedi aziendali da Supabase…';
    try{
      const {sharedMapsCustomers}=await import('../shared-maps-client.mjs');
      const data=await sharedMapsCustomers();
      if(token!==generation||!active())return;
      records=data;
      render();
      status.textContent='Catalogo condiviso aggiornato alle '+
        new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+
        '. Dati registrati dagli autisti: la verifica Maps resta separata.';
    }catch(error){
      if(token!==generation||!active())return;
      records=null;list.replaceChildren();
      for(const key of ['total','complete','missing','percent'])
        el('customer-overview-'+key).textContent='—';
      el('customer-overview-progress').style.width='0%';
      el('customer-overview-progress').setAttribute('aria-valuenow','0');
      status.textContent='Catalogo non disponibile: '+
        (error?.message||'impossibile recuperare le sedi.');
      el('customer-overview-matching').textContent='Nessun dato confermato';
    }finally{
      if(token===generation)refresh.disabled=false;
    }
  }
  filter.addEventListener('change',()=>{expanded=false;render();});
  more.addEventListener('click',()=>{expanded=!expanded;render();});
  refresh.addEventListener('click',()=>{void load();});
  reset();
  return {load,reset};
}
