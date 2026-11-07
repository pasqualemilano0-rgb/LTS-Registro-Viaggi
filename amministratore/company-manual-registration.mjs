/** Admin-only manual company customer onboarding.
 * A Maps link and a tariff are optional; sharing must succeed before pricing.
 * Existing tariffs are never silently overwritten.
 */
import {saveSharedManualCustomer} from '../shared-maps-client.mjs';
import {parseEuro,matchingRate} from './company-maps-registration.mjs?v=20261107-maps-extras-v1';

const get=id=>document.getElementById(id);
export function setupCompanyManual(account,{onSaved=async()=>{}}={}){
 const section=get('company-manual-add'),form=get('company-manual-form'),
  name=get('company-manual-name'),city=get('company-manual-city'),
  address=get('company-manual-address'),notes=get('company-manual-notes'),
  amount=get('company-manual-amount'),submit=get('company-manual-save'),
  status=get('company-manual-status');
 let busy=false,seq=0;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !get('dashboard').hidden&&get('dashboard').dataset.view==='rates';
 function inform(message,error=false){
  status.textContent=message;status.dataset.error=String(error);
 }
 function reset(){
  seq++;if(busy)return;form.reset();submit.disabled=false;
  inform('Inserisci nome e località. La via e la tariffa sono facoltative.');
 }
 async function save(event){
  event.preventDefault();
  if(busy||!authorized())return;
  const customer={name:name.value.trim(),city:city.value.trim(),
   address:address.value.trim(),notes:notes.value.trim()};
  if(customer.name.length<2||customer.city.length<2){
   inform('Inserisci nome cliente e località.',true);return;
  }
  let cents=null;
  try{if(amount.value.trim())cents=parseEuro(amount.value);}
  catch(error){inform(error.message,true);return;}
  const owner=account.getAccountId(),request=++seq;
  busy=true;submit.disabled=true;
  inform('Controllo clienti, doppioni e tariffe sul server…');
  let shared=false,rateSaved=false,created=false;
  try{
   // Check any existing tariff BEFORE a shared write. This avoids a duplicate
   // changing an established price without explicit rate-editor revision checks.
   const response=await account.companyTariffs('list');
   if(!Array.isArray(response?.tariffs))throw new Error('Tariffario aziendale non disponibile.');
   const existing=matchingRate(response.tariffs,customer);
   if(cents!==null&&existing&&existing.cents!==cents)
    throw new Error('È già presente una tariffa diversa per questo cliente e località. Modificala dal tariffario, senza sovrascriverla qui.');
   if(owner!==account.getAccountId()||!authorized())throw new Error('Sessione amministratore cambiata.');
   const result=await saveSharedManualCustomer(customer);
   shared=true;created=result.created;
   if(owner!==account.getAccountId()||!authorized())
    throw new Error('Cliente condiviso, ma la sessione è cambiata: controlla la tariffa.');
   if(cents!==null&&!existing){
    await account.companyTariffs('save',{
     client:result.customer.name,city:result.customer.city,cents
    });
    rateSaved=true;
   }
   if(request===seq&&authorized()){
    form.reset();
    inform((created?'Cliente manuale aggiunto all’elenco condiviso.':
     'Cliente già presente nell’elenco condiviso: nessun duplicato creato.')+
     (rateSaved?' Tariffa aziendale salvata.':cents!==null?' Tariffa già esistente mantenuta.':
      ' Potrai aggiungere la tariffa in seguito.')+
     ' Tutti gli autisti lo vedranno al prossimo aggiornamento online.');
   }
   try{await onSaved(result.customer);}catch{
    if(request===seq&&authorized())inform('Cliente salvato online; aggiorna l’elenco se non compare subito.',true);
   }
  }catch(error){
   if(request===seq&&authorized())inform(
    (shared&&!rateSaved&&cents!==null
     ?'Cliente già condiviso, ma il salvataggio della tariffa non è riuscito. ':
      'Salvataggio non completato. ')+
    (error?.message||'Riprova dopo aver aggiornato.'),true);
  }finally{
   busy=false;if(request===seq)submit.disabled=false;
  }
 }
 form.addEventListener('submit',event=>void save(event));
 reset();
 return {reset,focus(){
  if(!authorized())return;
  section.scrollIntoView({block:'start',behavior:'smooth'});
  name.focus({preventScroll:true});
 }};
}
