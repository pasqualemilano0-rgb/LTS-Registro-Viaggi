import {kilometresRequest} from '../kilometres-client.mjs';
import {romeDate,weekLabel} from '../shared/kilometres.mjs';
export function setupKilometresAdmin(account) {
 const trigger=document.getElementById('kilometres-admin-open');if(!trigger)return;
 trigger.addEventListener('click',async()=>{
  if(!account.isVerified()||account.getRole()!=='admin')return;
  const owner=account.getAccountId(),dialog=document.createElement('dialog');
  const make=(tag,text,attrs={})=>{const e=document.createElement(tag);e.textContent=text;Object.assign(e,attrs);return e;};
  const status=make('p','Caricamento…');status.setAttribute('role','status');
  const close=make('button','Chiudi',{type:'button',className:'button outline'});close.onclick=()=>dialog.close();
  const driver=make('select',''),month=make('input','',{type:'month',value:romeDate().slice(0,7)}),list=make('div','');
  driver.setAttribute('aria-label','Autista');month.setAttribute('aria-label','Mese');
  dialog.append(make('h2','Autorizzazioni CHILOMETRI'),make('p','Ogni autorizzazione consente una sola correzione entro 7 giorni, sempre venerdì o sabato.'),driver,month,list,status,close);document.body.append(dialog);dialog.showModal();
  const call=(action,data)=>kilometresRequest(action,data,account);
  const valid=()=>dialog.isConnected&&owner===account.getAccountId()&&account.isVerified()&&account.getRole()==='admin';
  const timer=setInterval(()=>{if(!valid())dialog.close();},1000);
  dialog.addEventListener('close',()=>{clearInterval(timer);dialog.replaceChildren();dialog.remove();});
  let generation=0;
  async function refresh(){const seq=++generation;list.replaceChildren();status.textContent='Caricamento…';try{
   const data=await call('list',{driverId:driver.value,month:month.value});if(!valid()||seq!==generation)return;
   for(const row of data.entries){
    const box=make('form',''),reason=make('input','',{type:'text',minLength:5,maxLength:500,required:true,placeholder:'Motivo della correzione'});
    reason.setAttribute('aria-label','Motivo correzione '+weekLabel(row.weekStart));
    const grant=make('button',row.editAllowed?'Rinnova autorizzazione':'Autorizza una modifica',{type:'submit',className:'button outline'});
    box.append(make('p',weekLabel(row.weekStart)+' · '+row.km+' km'),reason,grant);
    box.onsubmit=async event=>{event.preventDefault();grant.disabled=true;try{
     await call('grant',{driverId:data.driverId,weekStart:row.weekStart,expectedRevision:row.revision,reason:reason.value});
     if(valid()){await refresh();status.textContent='Autorizzazione registrata.';}
    }catch(error){if(valid())status.textContent=error.message;}finally{grant.disabled=false;}};list.append(box);
   }status.textContent=data.entries.length?'Totale: '+data.total+' km':'Nessuna rilevazione nel mese.';
  }catch(error){if(valid())status.textContent=error.message;}}
  driver.onchange=refresh;month.onchange=refresh;
  try{const result=await call('drivers',{});if(!valid())return;for(const d of result.drivers)driver.append(make('option',d.name.trim()||d.id,{value:d.id}));await refresh();}
  catch(error){if(valid())status.textContent=error.message;}
 });
}
