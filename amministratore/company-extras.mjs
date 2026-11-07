/** Admin-only extra-service price management per driver's verified archive.
 * The extra types are the eight predefined LTS service keys.
 * No personal archive is persisted in browser storage.
 */
import {SERVICES} from '../shared/domain.mjs';
import {parseEuro} from './company-maps-registration.mjs';
const byId=id=>document.getElementById(id);
const euro=cents=>cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',',');
const node=(tag,text='',className='')=>{
 const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;
};
export function setupCompanyExtras(account){
 const choose=byId('company-extra-driver'),refresh=byId('company-extra-refresh'),
  list=byId('company-extra-list'),status=byId('company-extra-status'),
  reason=byId('company-extra-reason');
 let drivers=[],driverId='',revision=null,rates=null,token=0,busy=false;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !byId('dashboard').hidden&&byId('dashboard').dataset.view==='rates';
 const feedback=(message,problem=false)=>{status.textContent=message;status.dataset.error=String(problem);};
 function clear(){
  token++;drivers=[];driverId='';rates=null;revision=null;busy=false;
  choose.replaceChildren();list.replaceChildren();reason.value='';
  refresh.disabled=false;feedback('Seleziona un autista per configurare i suoi servizi extra.');
 }
 function render(){
  list.replaceChildren();
  if(!rates)return;
  for(const service of SERVICES){
   const row=node('form','','company-extra-row');
   row.dataset.service=service.key;
   const label=node('label',service.label,'company-extra-label');
   const input=document.createElement('input');
   input.type='text';input.inputMode='decimal';input.value=euro(rates[service.key]);
   input.placeholder='Non impostato';input.maxLength=14;
   input.setAttribute('aria-label','Tariffa '+service.label+' in euro');
   const button=node('button','Salva','button primary small');
   button.type='submit';
   row.append(label,input,button);
   row.addEventListener('submit',event=>{
    event.preventDefault();void update(service,input);
   });
   list.append(row);
  }
 }
 async function update(service,input){
  if(!authorized()||busy||!driverId||revision===null||!rates)return;
  let cents;
  try{cents=input.value.trim()?parseEuro(input.value):null;}
  catch(error){feedback(error.message,true);return;}
  if(rates[service.key]===cents){feedback('Nessuna modifica: tariffa già impostata.');return;}
  if(!window.confirm('Aggiornare '+service.label+' per questo autista? '+
   'La sincronizzazione LTS può aggiornare anche gli extra selezionati nei viaggi precedenti. '+
   'Verifica gli importi storici prima di confermare.'))return;
  const active=driverId;busy=true;refresh.disabled=true;
  choose.disabled=true;list.querySelectorAll('input,button').forEach(el=>{el.disabled=true;});
  feedback('Salvataggio extra nell’archivio dell’autista…');
  try{
   const answer=await account.adminRecords('mutate',{
    driverId:active,expectedRevision:revision,requestId:crypto.randomUUID(),
    operation:'update',category:'extra',recordId:service.key,
    patch:{cents},reason:reason.value.trim()||'Aggiornamento servizio extra da dashboard'
   });
   if(!authorized()||active!==driverId)return;
   if(!Number.isSafeInteger(answer?.revision)||!answer?.state?.extraRates)
    throw new Error('Il server non ha confermato la modifica.');
   revision=answer.revision;rates={...answer.state.extraRates};
   render();feedback('Servizio extra aggiornato nell’archivio online dell’autista. Revisione '+revision+'.');
  }catch(error){
   if(authorized())feedback((error?.message||'Salvataggio non riuscito.')+
    ' In caso di conflitto aggiorna l’archivio prima di riprovare.',true);
  }finally{
   busy=false;refresh.disabled=false;choose.disabled=false;
   list.querySelectorAll('input,button').forEach(el=>{el.disabled=false;});
  }
 }
 async function loadSelected(){
  if(!authorized()||busy)return;
  const seq=++token,id=choose.value;
  driverId=id;rates=null;revision=null;list.replaceChildren();
  if(!id){feedback('Seleziona un autista.');return;}
  refresh.disabled=true;feedback('Caricamento servizi extra dell’autista…');
  try{
   const result=await account.adminRecords('read',{driverId:id});
   if(seq!==token||!authorized()||driverId!==id)return;
   if(!Number.isSafeInteger(result?.archive?.revision)||
      !result?.archive?.state?.extraRates)
    throw new Error('Archivio autista non ancora sincronizzato o non valido.');
   revision=result.archive.revision;rates={...result.archive.state.extraRates};
   render();feedback('Servizi extra sincronizzati: puoi impostare gli importi per questo autista.');
  }catch(error){
   if(seq===token&&authorized())feedback(error.message||'Archivio non disponibile.',true);
  }finally{if(seq===token)refresh.disabled=false;}
 }
 async function load(){
  if(!authorized()||busy)return false;
  const seq=++token;refresh.disabled=true;
  try{
   const result=await account.adminRecords('list');
   if(seq!==token||!authorized())return false;
   if(!Array.isArray(result?.drivers))throw new Error('Elenco autisti non disponibile.');
   drivers=result.drivers;
   choose.replaceChildren();
   const first=node('option','Seleziona un autista…');first.value='';choose.append(first);
   for(const driver of drivers){
    const opt=node('option',driver.name+' · '+(driver.phone||''));
    opt.value=driver.id;choose.append(opt);
   }
   if(driverId&&drivers.some(d=>d.id===driverId)){choose.value=driverId;await loadSelected();}
   else{driverId='';rates=null;revision=null;list.replaceChildren();
    feedback('Seleziona un autista per modificare gli importi extra.');}
   return true;
  }catch(error){
   if(seq===token&&authorized())feedback(error.message||'Impossibile leggere gli autisti.',true);
   return false;
  }finally{if(seq===token)refresh.disabled=false;}
 }
 choose.addEventListener('change',()=>void loadSelected());
 refresh.addEventListener('click',()=>{if(driverId)void loadSelected();else void load();});
 clear();
 return {load,reset:clear};
}
