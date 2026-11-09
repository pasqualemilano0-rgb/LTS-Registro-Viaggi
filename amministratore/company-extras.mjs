/** Shared company extra-service prices, edited only by an MFA-verified admin.
 * All eight prices live on the company tariff endpoint, not driver archives.
 * Updating prices never changes previously saved trip snapshots.
 */
import {SERVICES} from '../shared/domain.mjs';
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
 let rates=[],loaded=false,busy=false,generation=0;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !byId('dashboard').hidden&&byId('dashboard').dataset.view==='rates';
 const feedback=(msg,problem=false)=>{status.textContent=msg;status.dataset.error=String(problem);};
 function reset(){
  generation++;rates=[];loaded=false;busy=false;refresh.disabled=false;
  list.replaceChildren();feedback('Apri Tariffe per caricare il listino extra aziendale.');
 }
 function render(){
  list.replaceChildren();
  if(!loaded)return;
  for(const service of SERVICES.filter(item=>item.key!=='reefer')){
   const rate=rates.find(row=>row.serviceKey===service.key);
   const form=el('form','','company-extra-row');
   form.dataset.service=service.key;
   const label=el('label',service.label,'company-extra-label');
   const input=document.createElement('input');
   input.type='text';input.inputMode='decimal';input.maxLength=14;
   input.value=euro(rate?.cents??null);input.placeholder='Da configurare';
   input.setAttribute('aria-label','Importo aziendale '+service.label+' in euro');
   const button=el('button','Salva','button primary small');button.type='submit';
   button.disabled=!rate;
   form.append(label,input,button);
   form.addEventListener('submit',event=>{
    event.preventDefault();if(rate)void save(service,rate,input);
   });
   list.append(form);
  }
 }
 async function save(service,shown,input){
  if(!authorized()||busy||!loaded)return;
  let cents;
  try{cents=input.value.trim()?parseEuro(input.value):null;}
  catch(error){feedback(error.message,true);return;}
  if(shown.cents===cents){feedback('Importo già impostato.');return;}
  if(!window.confirm('Aggiornare la tariffa '+service.label+' per TUTTI gli autisti? '+
   'La nuova tariffa varrà per i nuovi viaggi. Le registrazioni precedenti manterranno i loro importi.'))return;
  busy=true;refresh.disabled=true;
  list.querySelectorAll('input,button').forEach(node=>{node.disabled=true;});
  feedback('Aggiornamento listino extra aziendale…');
  try{
   const answer=await account.companyTariffs('extra-save',{
    serviceKey:service.key,cents,expectedRevision:shown.revision
   });
   if(!answer?.extra||answer.extra.serviceKey!==service.key||
      !Number.isSafeInteger(answer.extra.revision))
    throw new Error('Il servizio non ha confermato la tariffa extra.');
   if(!authorized())return;
   rates=rates.map(row=>row.serviceKey===service.key?answer.extra:row);
   render();
   feedback('Tariffa '+service.label+' aggiornata per tutti gli autisti. '+
    'La vedranno al prossimo aggiornamento online. I viaggi storici non vengono ricalcolati.');
  }catch(error){
   if(authorized())feedback((error?.message||'Aggiornamento non riuscito.')+
    ' Premi Aggiorna extra per rileggere il listino aziendale.',true);
   // Keep the form for correction and do not silently overwrite the new typed value.
   list.querySelectorAll('input,button').forEach(node=>{node.disabled=false;});
  }finally{busy=false;refresh.disabled=false;}
 }
 async function load(){
  if(!authorized()||busy)return false;
  const id=++generation;refresh.disabled=true;
  if(!loaded)feedback('Caricamento degli extra aziendali…');
  try{
   const result=await account.companyTariffs('list');
   if(id!==generation||!authorized())return false;
   const extras=result?.extraRates;
   if(!Array.isArray(extras)||extras.length!==SERVICES.length||
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
