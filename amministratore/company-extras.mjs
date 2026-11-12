/** Shared company extra-service prices, edited only by an MFA-verified admin.
 * Only active services are editable; legacy REEFER remains in archived trips.
 * Updating prices never changes previously saved trip snapshots.
 */
import {SERVICES,ACTIVE_SERVICES} from '../shared/domain.mjs';
import {parseEuro} from './company-maps-registration.mjs';
const byId=id=>document.getElementById(id);
const euro=cents=>cents===null?'':(cents/100).toFixed(2).replace('.',',');
const el=(tag,text='',className='')=>{
 const node=document.createElement(tag);node.textContent=text;
 if(className)node.className=className;return node;
};
export function setupCompanyExtras(account){
 const refresh=byId('company-extra-refresh'),list=byId('company-extra-list'),
  status=byId('company-extra-status');
 let rates=[],loaded=false,busy=false,generation=0,loading=null;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !byId('dashboard').hidden&&byId('dashboard').dataset.view==='rates';
 const feedback=(msg,problem=false)=>{status.textContent=msg;status.dataset.error=String(problem);};
 function reset(){
  generation++;loading=null;rates=[];loaded=false;busy=false;refresh.disabled=false;
  list.replaceChildren();feedback('Apri Tariffe per caricare il listino extra aziendale.');
 }
 function collectUnsubmittedEdits(skipService=null){
  // Rendering from a confirmed server response must not erase a price that
  // the administrator has typed into another service but not yet saved.
  const edits=new Map();
  for(const row of list.querySelectorAll('form[data-service]')){
   const input=row.querySelector('input');
   if(input?.dataset.dirty==='true'&&row.dataset.service!==skipService)
    edits.set(row.dataset.service,input.value);
  }
  return edits;
 }
 function render({savedService=null}={}){
  if(!loaded)return;
  // Reuse existing inputs so background updates cannot move focus/caret or
  // change an unfinished amount. Each edited input keeps its shown revision.
  for(const service of ACTIVE_SERVICES){
   const rate=rates.find(row=>row.serviceKey===service.key);
   let form=[...list.querySelectorAll('form[data-service]')]
    .find(row=>row.dataset.service===service.key);
   if(!form){
    form=el('form','','company-extra-row');form.dataset.service=service.key;
    const label=el('label',service.label,'company-extra-label');
    const input=document.createElement('input');
    input.type='text';input.inputMode='decimal';input.maxLength=14;
    input.placeholder='Da configurare';
    input.addEventListener('input',()=>{input.dataset.dirty='true';});
    input.setAttribute('aria-label','Importo aziendale '+service.label+' in euro');
    const button=el('button','Salva','button primary small');button.type='submit';
    form.append(label,input,button);
    form.addEventListener('submit',event=>{
     event.preventDefault();if(input.ltsShownRate)void save(service,input.ltsShownRate,input);
    });
    list.append(form);
   }
   const input=form.querySelector('input');
   if(savedService===service.key)input.dataset.dirty='false';
   if(savedService===service.key||
      (input.dataset.dirty!=='true'&&input!==document.activeElement)){
    input.value=euro(rate?.cents??null);input.ltsShownRate=rate;
   }
   const button=form.querySelector('button');
   if(button)button.disabled=!rate;
  }
 }
 async function save(service,shown,input){
  if(!authorized()||busy||!loaded)return;
  let cents;
  try{cents=input.value.trim()?parseEuro(input.value):null;}
  catch(error){feedback(error.message,true);return;}
  if(shown.cents===cents){
   input.dataset.dirty='false';
   feedback('Importo già impostato.');return;
  }
  if(!window.confirm('Aggiornare la tariffa '+service.label+' per TUTTI gli autisti? '+
   'La nuova tariffa varrà per i nuovi viaggi. Le registrazioni precedenti manterranno i loro importi.'))return;
  const owner=account.getAccountId?.(),when=++generation;
  busy=true;loading=null;refresh.disabled=true;
  list.querySelectorAll('input,button').forEach(node=>{node.disabled=true;});
  feedback('Aggiornamento listino extra aziendale…');
  try{
   const answer=await account.companyTariffs('extra-save',{
    serviceKey:service.key,cents,expectedRevision:shown.revision
   });
   if(!answer?.extra||answer.extra.serviceKey!==service.key||
      !Number.isSafeInteger(answer.extra.revision))
    throw new Error('Il servizio non ha confermato la tariffa extra.');
   if(when!==generation||owner!==account.getAccountId?.()||!authorized())return;
   rates=rates.map(row=>row.serviceKey===service.key?answer.extra:row);
   render({savedService:service.key});
   feedback('Tariffa '+service.label+' aggiornata per tutti gli autisti. '+
    'La vedranno al prossimo aggiornamento online. I viaggi storici non vengono ricalcolati.');
  }catch(error){
   if(when===generation&&owner===account.getAccountId?.()&&authorized())feedback((error?.message||'Aggiornamento non riuscito.')+
    ' Premi Aggiorna extra per rileggere il listino aziendale.',true);
   // Keep the form for correction and do not silently overwrite the new typed value.
  }finally{
   if(when===generation&&owner===account.getAccountId?.()){
    busy=false;refresh.disabled=false;
    list.querySelectorAll('input,button').forEach(node=>{node.disabled=false;});
   }
  }
 }
 function load({silent=false,trailing=false}={}){
  if(!authorized()||busy)return Promise.resolve(false);
  const owner=account.getAccountId?.();
  if(loading&&loading.owner===owner){
   loading.trailing||=trailing||!silent;return loading.promise;
  }
  const job={owner,trailing:false,promise:null};loading=job;
  job.promise=loadOnce({silent}).finally(()=>{
   if(loading!==job)return;
   loading=null;
   if(job.trailing&&owner===account.getAccountId?.()&&authorized())void load({silent:true});
  });
  return job.promise;
 }
 async function loadOnce({silent=false}={}){
  if(!authorized()||busy)return false;
  // Never replace unsaved changes with a periodic or manual server reload.
  if(!silent&&collectUnsubmittedEdits().size){
   feedback('Hai importi extra non ancora salvati. Salvali prima di aggiornare l’elenco.',true);
   return false;
  }
  const id=++generation;refresh.disabled=true;
  if(!loaded)feedback('Caricamento degli extra aziendali…');
  try{
   const result=await account.companyTariffs('list');
   if(id!==generation||!authorized())return false;
   const extras=result?.extraRates;
   // Accept both older eight-key server catalogs and the retired seven-key
   // format; only the seven active services can be presented or edited.
   if(!Array.isArray(extras)||extras.length<ACTIVE_SERVICES.length||extras.length>SERVICES.length||
    new Set(extras.map(row=>row?.serviceKey)).size!==extras.length||
    ACTIVE_SERVICES.some(service=>!extras.some(row=>row.serviceKey===service.key))||
    extras.some(row=>!SERVICES.some(service=>service.key===row.serviceKey)||
     !(row.cents===null||(Number.isSafeInteger(row.cents)&&row.cents>=0&&row.cents<=99999999))||
     !Number.isSafeInteger(row.revision)||row.revision<1))
    throw new Error('Listino servizi extra aziendale incompleto.');
   rates=extras;loaded=true;render();
   feedback('Tariffe extra aziendali sincronizzate. Un listino unico per tutti gli autisti.');
   return true;
  }catch(error){
   if(id===generation&&authorized())feedback(error.message||'Listino extra non disponibile.',true);
   return false;
  }finally{if(id===generation)refresh.disabled=false;}
 }
 refresh.addEventListener('click',()=>void load());
 reset();
 return {load,reset};
}
