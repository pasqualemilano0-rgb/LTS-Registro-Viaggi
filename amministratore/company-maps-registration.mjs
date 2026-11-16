/** Protected admin Google Maps onboarding: review before any write.
 * The shared customer API deduplicates links and verified site identities.
 * Customer and fare use separate APIs: report partial success if pricing fails.
 */
import {readMapsCustomer} from '../maps-reader-client.mjs';
import {sharedMapsCustomers,saveSharedPricedCustomer} from '../shared-maps-client.mjs?v=20261110-atomic-v1';
import {customerSiteRateKey} from './customer-overview-model.mjs?v=20261107-client-tariff-sync-v2';

const byId=id=>document.getElementById(id);
const euro=cents=>(cents/100).toFixed(2).replace('.',',');
export function parseEuro(value){
 let s=String(value??'').trim().replace(/[€\s]/gu,'');
 if(s.includes(',')){
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))
   throw new Error('Importo non valido. Usa ad esempio 85,50.');
  s=s.replace(/\./gu,'').replace(',','.');
 }
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))
  throw new Error('Inserisci una tariffa in euro, ad esempio 85,50.');
 const [whole,dec='']=s.split('.');
 const cents=Number(whole)*100+Number(dec.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<0||cents>99999999)
  throw new Error('Tariffa fuori dai limiti consentiti.');
 return cents;
}
const normalize=value=>String(value??'').normalize('NFC').trim()
 .replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
export function matchingSite(customers,site){
 const key=customerSiteRateKey(site)+'\u0000'+normalize(site.address);
 return (Array.isArray(customers)?customers:[]).find(row=>
  row.mapsUrl===site.mapsUrl||
  (customerSiteRateKey(row)+'\u0000'+normalize(row.address)===key))||null;
}
export function matchingRate(rates,site){
 const key=customerSiteRateKey(site);
 return (Array.isArray(rates)?rates:[]).find(row=>
  customerSiteRateKey(row)===key)||null;
}
export function setupCompanyMaps(account,{onSaved=async()=>{}}={}){
 const form=byId('company-maps-form'),url=byId('company-maps-url'),
  read=byId('company-maps-read'),save=byId('company-maps-save'),
  preview=byId('company-maps-preview'),name=byId('company-maps-name'),
  city=byId('company-maps-city'),address=byId('company-maps-address'),
  warning=byId('company-maps-warning'),amount=byId('company-maps-amount'),
  status=byId('company-maps-status'),duplicate=byId('company-maps-duplicate');
 let selected=null,existing=null,rate=null,siteRows=[],rateRows=[],seq=0,busy=false;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !byId('dashboard').hidden&&byId('dashboard').dataset.view==='rates';
 function feedback(message,error=false){
  status.textContent=message;status.dataset.error=String(error);
 }
 // Google Maps often returns a street address without a reliable town.
 // Require a human-reviewed locality; never guess from the postcode or a road label.
 function reviewedSite(){
  if(!selected)return null;
  const locality=normalize(city.value);
  if(locality.length<2||locality.length>100||
   !/^[\p{L}][\p{L}\p{M} .’'\-]*$/u.test(locality))return null;
  return {...selected,city:locality};
 }
 function updatePreview({initial=false}={}){
  const proposal=reviewedSite();
  existing=proposal?matchingSite(siteRows,proposal):null;
  rate=proposal?matchingRate(rateRows,existing||proposal):null;
  warning.textContent=(selected?.warnings||[]).filter(text=>
   proposal||!text.includes('La città non è disponibile nel link')).join(' ');
  if(!proposal){
   duplicate.textContent='Località obbligatoria: indica il Comune verificato prima di salvare.';
   save.disabled=true;
   feedback('Completa la località (Comune) prima di pubblicare cliente e tariffa.',true);
   return;
  }
  if(existing&&normalize(existing.city)!==proposal.city){
   duplicate.textContent='Questo link Google Maps è già associato alla località '+existing.city+
    '. Correggi la località o gestisci la sede già registrata.';
   save.disabled=true;
   feedback('Non è possibile cambiare la località di una sede già condivisa da questo modulo.',true);
   return;
  }
  duplicate.textContent=existing
   ?'Sede già nell’elenco condiviso: non sarà duplicata.'
   :'Nuova sede: verrà aggiunta all’elenco clienti aziendali.';
  if(rate){
   if(initial)amount.value=euro(rate.cents);
   duplicate.textContent+=' Tariffa esistente: '+euro(rate.cents)+
    ' €. Se la cambi verrà richiesta una conferma.';
  }else if(initial)amount.value='';
  save.disabled=false;
  feedback('Località verificata: controlla indirizzo e tariffa, poi salva.');
 }
 function reset(){
  seq++;selected=null;existing=null;rate=null;siteRows=[];rateRows=[];
  form.reset();preview.hidden=true;read.disabled=busy;url.disabled=busy;save.disabled=true;
  warning.textContent='';duplicate.textContent='';feedback('Incolla un link Google Maps per iniziare.');
 }
 function invalidate(){
  seq++;selected=null;existing=null;rate=null;siteRows=[];rateRows=[];
  preview.hidden=true;save.disabled=true;duplicate.textContent='';
  feedback('Link modificato: premi Leggi Google Maps per verificare la sede.');
 }
 async function inspect(){
  if(busy||!authorized())return;
  const token=++seq;selected=null;existing=null;rate=null;
  preview.hidden=true;save.disabled=true;read.disabled=true;
  const link=url.value.trim();
  if(!link){read.disabled=false;feedback('Inserisci il link Google Maps.',true);return;}
  feedback('Lettura Google Maps e controllo dei clienti già presenti…');
  try{
   const proposal=await readMapsCustomer(link);
   const [siteResult,rateResult]=await Promise.all([
    sharedMapsCustomers(),account.companyTariffs('list')
   ]);
   if(token!==seq||!authorized()||url.value.trim()!==link)return;
   if(!Array.isArray(siteResult)||!Array.isArray(rateResult?.tariffs))
    throw new Error('Non è stato possibile verificare l’elenco clienti e le tariffe.');
   selected=proposal;siteRows=siteResult;rateRows=rateResult.tariffs;
   name.textContent=proposal.name;city.value=proposal.city;address.textContent=proposal.address;
   preview.hidden=false;
   updatePreview({initial:true});
  }catch(error){
   if(token===seq&&authorized())feedback(error?.message||'Verifica Google Maps non riuscita.',true);
  }finally{if(token===seq)read.disabled=false;}
 }
 async function submit(event){
  event.preventDefault();
  if(busy||!authorized()||!selected||save.disabled)return;
  const proposal=reviewedSite();
  if(!proposal){feedback('Completa la località (Comune) prima di salvare.',true);city.focus();return;}
  if(existing&&normalize(existing.city)!==proposal.city){
   feedback('La località non coincide con quella già condivisa per questo link Google Maps.',true);return;
  }
  let cents;
  try{cents=parseEuro(amount.value);}
  catch(error){feedback(error.message,true);return;}
  if(rate&&rate.cents!==cents&&!window.confirm(
   'Esiste già una tariffa per '+proposal.name+' · '+proposal.city+
   '. Sostituire '+euro(rate.cents)+' € con '+euro(cents)+' € per i nuovi viaggi?'))return;
  busy=true;save.disabled=true;read.disabled=true;url.disabled=true;city.disabled=true;
  const accountId=account.getAccountId(),saveToken=seq;
  let confirmed=null;
  try{
   // The Edge endpoint revalidates MFA and writes the site AND price together.
   // On error neither is published; existing prices require optimistic revision.
   confirmed=await saveSharedPricedCustomer({
    source:'maps',mapsUrl:proposal.mapsUrl,name:proposal.name,
    city:proposal.city,address:proposal.address,cents,
    expectedRevision:rate?.revision??0
   });
   if(account.getAccountId()!==accountId)
    throw new Error('Sessione cambiata dopo il salvataggio: aggiorna il tariffario prima di riprovare.');
   if(saveToken===seq&&authorized())feedback(confirmed.created
    ?'Cliente Google Maps e tariffa salvati insieme. Disponibili agli autisti al prossimo aggiornamento.'
    :'Sede già presente: tariffa verificata o aggiornata senza duplicati.');
   if(saveToken===seq){
    form.reset();selected=null;rate=null;existing=null;preview.hidden=true;
   }
   try{await onSaved(confirmed.customer);}
   catch{if(saveToken===seq&&authorized())feedback(
    'Cliente e tariffa salvati. Aggiornamento elenco non riuscito: premi Aggiorna elenco.',true);}
  }catch(error){
   if(saveToken===seq&&authorized())feedback(
    (confirmed?'Salvataggio già confermato: verifica la sessione e aggiorna l’elenco. ':
     'Cliente e tariffa NON pubblicati. ')+
    (error?.message||'Rileggi la sede prima di riprovare.'),true);
  }finally{
   busy=false;read.disabled=false;url.disabled=false;city.disabled=false;
   if(saveToken===seq)save.disabled=!reviewedSite();
  }
 }
 url.addEventListener('input',invalidate);
 city.addEventListener('input',()=>{
  if(!selected||busy)return;
  updatePreview();
 });
 read.addEventListener('click',()=>void inspect());
 form.addEventListener('submit',event=>void submit(event));
 reset();
 return {reset,focus(){
  if(!authorized())return;
  byId('company-maps-add').scrollIntoView({block:'start',behavior:'smooth'});
  url.focus({preventScroll:true});
 }};
}
