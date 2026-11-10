/** In-app notification center for Maps proposals. Auth/MFA enforced by Edge Function. */
import {pendingMapsApprovals,decideMapsApproval} from '../shared-maps-client.mjs?v=20261110-maps-approval-v1';
const byId=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(c/100);
function parseCents(value){
 const raw=String(value||'').trim().replace(/\s/g,'').replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new Error('Tariffa obbligatoria: scrivi per esempio 85,50.');
 const [whole,decimal='']=raw.split('.');
 const result=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(result)||result<0||result>99999999)
  throw new Error('Tariffa fuori dai limiti consentiti.');
 return result;
}
const text=(tag,cls,value)=>{
 const n=document.createElement(tag);if(cls)n.className=cls;
 n.textContent=String(value);return n;
};
export function setupMapsApprovals(account,{onApproved=()=>{}}={}){
 const panel=byId('maps-approvals'),list=byId('maps-approvals-list'),
  status=byId('maps-approvals-status'),count=byId('maps-approvals-count'),
  refresh=byId('maps-approvals-refresh'),badge=byId('approval-nav-count');
 let generation=0,busy=false,loaded=false,requests=[];
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !byId('dashboard').hidden&&byId('admin-resume-guard').hidden;
 function feedback(message,error=false){
  status.textContent=message;status.dataset.error=String(error);
 }
 function updateBadge(){
  const n=loaded?requests.length:0;
  count.textContent=loaded?String(n):'—';
  badge.textContent=n>0?(n>99?'99+':String(n)):'';
  badge.hidden=n===0;
  byId('overview-tab').dataset.needsReview=String(n>0);
  byId('rates-tab').dataset.needsReview=String(n>0);
 }
 function render(){
  list.replaceChildren();updateBadge();
  if(!loaded)return;
  if(!requests.length){
   list.append(text('p','maps-approval-empty','Nessun nuovo cliente in attesa. Le richieste degli autisti appariranno qui automaticamente.'));
   return;
  }
  for(const item of requests){
   const card=text('article','maps-approval-card','');
   const head=text('div','maps-approval-identity','');
   head.append(text('strong','',item.name),text('span','',item.city));
   const details=text('p','maps-approval-address',item.address);
   const origin=text('p','maps-approval-origin',
    'Proposto da '+item.driver+' · '+new Date(item.submittedAt).toLocaleString('it-IT'));
   const link=document.createElement('a');
   link.textContent='Verifica su Google Maps';link.target='_blank';
   link.rel='noopener noreferrer';link.className='maps-approval-link';
   try{
    const url=new URL(item.mapsUrl);
    if(url.protocol==='https:'&&['google.com','www.google.com','google.it','www.google.it',
      'maps.google.com','maps.google.it','maps.app.goo.gl','goo.gl'].includes(url.hostname))
     link.href=url.href;
   }catch{}
   const controls=text('div','maps-approval-controls','');
   const label=text('label','','Tariffa aziendale (€)');
   const input=document.createElement('input');
   input.type='text';input.inputMode='decimal';input.maxLength=14;
   input.placeholder='Es. 85,50';input.autocomplete='off';
   input.setAttribute('aria-label','Tariffa in euro per '+item.name+' · '+item.city);
   label.append(input);
   const approve=text('button','button primary','Approva e tariffa');
   const reject=text('button','button outline','Rifiuta');
   approve.type=reject.type='button';
   approve.addEventListener('click',async()=>{
    if(!authorized()||busy)return;
    let cents;
    try{cents=parseCents(input.value);}catch(error){feedback(error.message,true);input.focus();return;}
    if(!window.confirm('Approvare '+item.name+' · '+item.city+' con tariffa '+money(cents)+'? Il cliente sarà condiviso con tutti gli autisti.'))return;
    const owner=account.getAccountId();
    busy=true;approve.disabled=reject.disabled=refresh.disabled=true;
    feedback('Conferma sicura di cliente e tariffa in corso…');
    try{
     await decideMapsApproval(item.id,'approve',cents);
     if(owner!==account.getAccountId())return;
     feedback('Cliente approvato e tariffa salvata. I nuovi viaggi useranno il listino aziendale.');
     await load({force:true});
     onApproved();
    }catch(error){feedback(error?.message||'Operazione non confermata. Riprova.',true);}
    finally{busy=false;refresh.disabled=false;}
   });
   reject.addEventListener('click',async()=>{
    if(!authorized()||busy||!window.confirm('Rifiutare la richiesta di '+item.name+'? La sede non sarà condivisa.'))return;
    const owner=account.getAccountId();
    busy=true;approve.disabled=reject.disabled=refresh.disabled=true;
    feedback('Rifiuto della proposta in corso…');
    try{
     await decideMapsApproval(item.id,'reject');
     if(owner!==account.getAccountId())return;
     feedback('Richiesta rifiutata: nessuna tariffa o sede è stata creata.');
     await load({force:true});
    }catch(error){feedback(error?.message||'Rifiuto non confermato.',true);}
    finally{busy=false;refresh.disabled=false;}
   });
   controls.append(label,approve,reject);
   card.append(head,details,origin,link,controls);list.append(card);
  }
 }
 async function load({silent=false,force=false}={}){
  if(!authorized()||(busy&&!force))return false;
  if(!force&&silent&&panel.contains(document.activeElement)&&
   document.activeElement?.matches('input'))return false;
  const seq=++generation,owner=account.getAccountId();
  if(!silent){refresh.disabled=true;feedback('Controllo delle nuove richieste…');}
  try{
   const next=await pendingMapsApprovals();
   if(seq!==generation||owner!==account.getAccountId()||!authorized())return false;
   const changed=!loaded||JSON.stringify(next)!==JSON.stringify(requests);
   requests=next;loaded=true;
   if(changed)render();
   if(!silent||changed)feedback(next.length?
    next.length+' '+(next.length===1?'richiesta da approvare.':'richieste da approvare.')+
    ' Verifica i dati e la tariffa prima di confermare.':
    'Centro notifiche aggiornato: nessuna richiesta da approvare.');
   return true;
  }catch(error){
   if(seq===generation&&authorized()){
    feedback('Impossibile verificare le richieste. '+(error?.message||'Riprova.'),true);
    if(!loaded){count.textContent='—';}
   }
   return false;
  }finally{if(seq===generation)refresh.disabled=false;}
 }
 function reset(){
  generation++;busy=false;loaded=false;requests=[];
  list.replaceChildren();refresh.disabled=false;updateBadge();
  feedback('Accedi come amministratore verificato per leggere le richieste.');
 }
 refresh.addEventListener('click',()=>{void load();});
 reset();
 return {load,reset};
}
