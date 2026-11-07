/** Protected company tariff editor, linked to the shared Google Maps site catalog.
 * Customer records remain read-only. No driver archive or historical trip is rewritten. */
import {tariffLinkedCustomerSites,customerSiteRateKey,hasUsableAddress} from './customer-overview-model.mjs?v=20261107-client-tariff-sync-v2';

const get=id=>document.getElementById(id);
const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(value??'');return n;};
const money=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(c/100);
const clean=s=>String(s??'').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
function toCents(value){
 let s=String(value??'').trim().replace(/[€\s]/gu,'');
 if(!s)throw new Error('Inserisci l’importo in euro.');
 if(s.includes(',')){
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))
   throw new Error('Usa euro e al massimo due decimali, ad esempio 85,50.');
  s=s.replace(/\./gu,'').replace(',','.');
 }
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))
  throw new Error('Importo non valido. Esempio: 85,50.');
 const [eur,frac='']=s.split('.'),cents=Number(eur)*100+Number(frac.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<0||cents>99999999)
  throw new Error('L’importo è fuori dai limiti consentiti.');
 return cents;
}
export function setupCompanyRates(account){
 const pane=get('company-rates'),form=get('company-rates-form');
 const client=get('company-rate-client'),city=get('company-rate-city'),
  amount=get('company-rate-amount'),cancel=get('company-rate-cancel'),
  submit=get('company-rate-submit'),search=get('company-rates-search'),
  list=get('company-rates-list'),status=get('company-rates-status'),
  count=get('company-rates-count'),refresh=get('company-rates-refresh'),
  title=get('company-rates-form-title'),
  sitesList=get('company-sites-list'),sitesCount=get('company-sites-count'),
  sitesMore=get('company-sites-more'),
  clientOptions=get('company-rate-client-options'),
  cityOptions=get('company-rate-city-options');
 let rows=[],sites=[],editing=null,generation=0,busy=false;
 let ratesLoaded=false,sitesLoaded=false,sitesExpanded=false;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !get('dashboard').hidden&&get('dashboard').dataset.view==='rates';
 const feedback=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
 const rateForSite=site=>rows.find(rate=>clean(rate.client)===clean(site.name)&&
  clean(rate.city)===clean(site.city));
 function cityChoices(){
  const matched=sites.filter(site=>clean(site.name)===clean(client.value));
  const names=[...new Set(matched.map(site=>site.city))].sort((a,b)=>a.localeCompare(b,'it'));
  cityOptions.replaceChildren(...names.map(name=>{
   const option=document.createElement('option');option.value=name;return option;
  }));
  return names;
 }
 function customerChoices(){
  const names=[...new Set(sites.map(site=>site.name))].sort((a,b)=>a.localeCompare(b,'it'));
  clientOptions.replaceChildren(...names.map(name=>{
   const option=document.createElement('option');option.value=name;return option;
  }));
  cityChoices();
 }
 function clearForm(){
  editing=null;form.reset();client.disabled=false;city.disabled=false;
  title.textContent='Nuova tariffa';submit.textContent='Salva tariffa';cancel.hidden=true;
  cityChoices();
 }
 function editRate(tariff){
  if(!authorized()||busy)return;
  editing=tariff;title.textContent='Modifica tariffa';client.value=tariff.client;city.value=tariff.city;
  amount.value=(tariff.cents/100).toFixed(2).replace('.',',');
  client.disabled=true;city.disabled=true;cancel.hidden=false;
  submit.textContent='Aggiorna importo';
  cityChoices();
  pane.querySelector('#company-rates-editor').scrollIntoView({block:'start',behavior:'smooth'});
  amount.focus({preventScroll:true});
 }
 function prefillSite(site){
  if(!authorized()||busy||!site?.name||!site?.city)return;
  const existing=rateForSite(site);
  if(existing){editRate(existing);return;}
  clearForm();client.value=site.name;city.value=site.city;cityChoices();
  feedback('Sede selezionata: '+site.name+' · '+site.city+'. Inserisci soltanto la tariffa in euro.');
  pane.querySelector('#company-rates-editor').scrollIntoView({block:'start',behavior:'smooth'});
  amount.focus({preventScroll:true});
 }
 function renderRates(term){
  const visible=rows.filter(rate=>clean(rate.client+' '+rate.city).includes(term));
  count.textContent=rows.length+' tariffe aziendali · '+visible.length+' visualizzate';
  list.replaceChildren();
  if(!ratesLoaded)list.append(node('p','company-rates-empty','Aggiornamento non riuscito: eventuali prezzi qui sotto sono gli ultimi disponibili, non confermati. Salvataggio disabilitato.'));
  else if(!visible.length)list.append(node('p','company-rates-empty',
    rows.length?'Nessuna tariffa corrisponde alla ricerca.':
    'Non ci sono ancora importi aziendali. Seleziona una sede Google Maps qui sotto per iniziare.'));
  for(const tariff of visible){
   const row=document.createElement('article');row.className='company-rate-row';
   const info=node('div','company-rate-main','');
   const label=Number.isFinite(Date.parse(tariff.updatedAt||''))?
    'Aggiornata '+new Date(tariff.updatedAt).toLocaleDateString('it-IT'):'Tariffa aziendale';
   info.append(node('strong','company-rate-name',tariff.client),
    node('span','company-rate-city',tariff.city),
    node('small','company-rate-updated',label));
   const price=node('strong','company-rate-price',money(tariff.cents));
   const edit=document.createElement('button');edit.type='button';edit.className='button outline company-rate-edit';
   edit.textContent='Modifica';edit.setAttribute('aria-label','Modifica tariffa '+tariff.client+', '+tariff.city);
   edit.addEventListener('click',()=>editRate(tariff));
   row.append(info,price,edit);list.append(row);
  }
 }
 function renderSites(){
  sitesList.replaceChildren();
  if(!sitesLoaded){
   sitesCount.textContent='Elenco clienti Google Maps non disponibile. Usa Aggiorna elenco.';
   sitesMore.hidden=true;return;
  }
  const coverage=tariffLinkedCustomerSites(sites,rows,search.value);
  const missing=coverage.sites.filter(site=>!site.hasRate);
  sitesCount.textContent=coverage.priced+' sedi con tariffa · '+coverage.unpriced+
   ' ancora da tariffare su '+coverage.total+' sedi Google Maps'+
   (search.value.trim()?' · '+missing.length+' corrispondenze senza tariffa':'');
  if(!missing.length)sitesList.append(node('p','company-sites-empty',
   search.value.trim()?'Nessuna sede senza tariffa corrisponde alla ricerca.':
   coverage.unpriced?'Cerca una sede diversa.':'Tutte le sedi Google Maps hanno un importo aziendale.'));
  const shown=sitesExpanded?missing:missing.slice(0,10);
  for(const site of shown){
   const item=document.createElement('article');item.className='company-site-row';
   const identity=node('div','company-site-main','');
   identity.append(node('strong','company-site-name',site.name),
    node('span','company-site-city',site.city));
   if(hasUsableAddress(site.address))identity.append(node('small','company-site-address',site.address));
   else identity.append(node('small','company-site-address is-missing','Via non ancora confermata'));
   const action=document.createElement('button');
   action.type='button';action.className='button outline company-site-price';
   action.textContent='Imposta tariffa';action.disabled=!ratesLoaded;
   action.setAttribute('aria-label','Imposta tariffa '+site.name+', '+site.city);
   action.addEventListener('click',()=>prefillSite(site));
   item.append(identity,action);sitesList.append(item);
  }
  sitesMore.hidden=missing.length<=10;
  sitesMore.textContent=sitesExpanded?'Mostra meno':'Mostra altre '+(missing.length-shown.length)+' sedi';
 }
 function render(){
  const term=clean(search.value);
  renderRates(term);renderSites();
 }
 function reset(){
  generation++;rows=[];sites=[];ratesLoaded=false;sitesLoaded=false;sitesExpanded=false;
  busy=false;search.value='';list.replaceChildren();sitesList.replaceChildren();
  clearForm();customerChoices();
  count.textContent='—';sitesCount.textContent='Apri Tariffe per sincronizzare le sedi Google Maps.';
  feedback('Apri Tariffe aziendali per caricare i dati.');
  sitesMore.hidden=true;refresh.disabled=false;submit.disabled=true;
 }
 async function load({silent=false}={}){
  if(!authorized()){reset();return false;}
  // Never displace a driver/site/amount currently being typed, nor interrupt
  // a save. The next polling tick (or manual refresh) will retry.
  if(silent&&(busy||refresh.disabled||form.contains(document.activeElement)))return false;
  const seq=++generation;
  if(!silent){
   refresh.disabled=true;submit.disabled=true;
   feedback('Sincronizzazione di tariffe e clienti aziendali…');
  }
  const [rateResult,customerResult]=await Promise.allSettled([
   account.companyTariffs('list'),
   import('../shared-maps-client.mjs').then(module=>module.sharedMapsCustomers())
  ]);
  if(seq!==generation||!authorized())return false;
  const validRates=rateResult.status==='fulfilled'&&Array.isArray(rateResult.value?.tariffs);
  const validCustomers=customerResult.status==='fulfilled'&&Array.isArray(customerResult.value);
  // A failed online check is not proof that the company has zero rates.
  // Keep the previous verified snapshot for reference, but disable writes.
  const nextRates=validRates?rateResult.value.tariffs:rows;
  const nextSites=validCustomers?customerResult.value:sites;
  const changed=JSON.stringify(rows)!==JSON.stringify(nextRates)||
   JSON.stringify(sites)!==JSON.stringify(nextSites)||
   ratesLoaded!==validRates||sitesLoaded!==validCustomers;
  rows=nextRates;ratesLoaded=validRates;
  sites=nextSites;sitesLoaded=validCustomers;
  if(changed||!silent){
   customerChoices();render();
  }
  const clock=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  if(!ratesLoaded)feedback(
   'Tariffario non aggiornato: dati aziendali non disponibili. Riprova quando la connessione funziona.',true);
  else if(!sitesLoaded)feedback(
   'Tariffe aggiornate alle '+clock+', ma catalogo Google Maps non disponibile. Sincronizzazione parziale.',true);
  else{
   const coverage=tariffLinkedCustomerSites(sites,rows);
   feedback('Clienti e tariffe aggiornati alle '+clock+' · '+coverage.priced+
    ' sedi con tariffa, '+coverage.unpriced+' senza tariffa su '+coverage.total+
    '. Gli importi storici restano invariati.');
  }
  if(seq===generation){
   refresh.disabled=false;submit.disabled=!ratesLoaded;
  }
  return validRates&&validCustomers;
 }
 cancel.addEventListener('click',clearForm);
 search.addEventListener('input',()=>{sitesExpanded=false;render();});
 sitesMore.addEventListener('click',()=>{sitesExpanded=!sitesExpanded;renderSites();});
 refresh.addEventListener('click',()=>void load());
 client.addEventListener('input',()=>{
  const options=cityChoices();
  if(options.length===1&&!city.value.trim())city.value=options[0];
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!authorized()||!ratesLoaded)return;
  let payload;
  try{
   const name=clean(client.value),place=clean(city.value),cents=toCents(amount.value);
   if(name.length<2||name.length>500||place.length<1||place.length>500)
    throw new Error('Inserisci cliente e località validi.');
   if(!editing&&rows.some(rate=>clean(rate.client)===name&&clean(rate.city)===place))
    throw new Error('Questa sede ha già una tariffa aziendale. Usa Modifica nell’elenco.');
   payload={client:name,city:place,cents};
   if(editing)Object.assign(payload,{id:editing.id,expectedRevision:editing.revision});
  }catch(e){feedback(e.message,true);return;}
  busy=true;submit.disabled=true;refresh.disabled=true;
  feedback('Salvataggio tariffa aziendale in corso…');
  try{
   await account.companyTariffs('save',payload);
   clearForm();
   await load();
   if(authorized()&&ratesLoaded)
    feedback('Tariffa salvata e disponibile per tutti gli autisti al prossimo aggiornamento online. Gli importi storici restano invariati.');
  }catch(e){feedback(e?.message||'Tariffa non salvata. Riprova.',true);}
  finally{busy=false;submit.disabled=!ratesLoaded;if(authorized())refresh.disabled=false;}
 });
 reset();
 return {load,reset,prefillSite};
}
