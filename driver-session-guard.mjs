/** Driver session resumption: protect the archive during a server check without
 * destroying drafts on a recoverable network failure.
 * An explicit authentication revocation is handled separately by account-access.mjs.
 */
export function transientDriverSessionError(error){
 return error?.offline===true || ![401,403].includes(error?.status);
}
export function createDriverSessionShield({document,root,onRetry}){
 if(!document?.body||!root||typeof onRetry!=='function')throw new TypeError('Guardia sessione non valida');
 let shield=null,description=null,retry=null,previousInert=false;
 function show(message='Verifica sicura della sessione in corso…',{retryable=true}={}){
  if(!shield){
   previousInert=Boolean(root.inert);
   root.inert=true;
   document.body.classList.add('lts-driver-session-blocked');
   shield=document.createElement('section');
   shield.id='lts-driver-session-shield';
   shield.className='lts-driver-session-shield';
   shield.setAttribute('role','alertdialog');
   shield.setAttribute('aria-modal','true');
   shield.setAttribute('aria-labelledby','lts-driver-session-shield-title');
   shield.setAttribute('aria-describedby','lts-driver-session-shield-description');
   const content=document.createElement('div');
   content.className='lts-driver-session-shield-card';
   const mark=document.createElement('span');
   mark.className='lts-driver-session-mark';mark.textContent='LTS';
   const heading=document.createElement('h1');
   heading.id='lts-driver-session-shield-title';heading.textContent='Connessione al registro';
   description=document.createElement('p');
   description.id='lts-driver-session-shield-description';
   const note=document.createElement('p');
   note.className='lts-driver-session-shield-note';
   note.textContent='Non occorre ripetere l’accesso. I viaggi e le bozze restano conservati.';
   retry=document.createElement('button');
   retry.type='button';retry.className='lts-driver-session-retry';
   retry.textContent='Riprova connessione';
   retry.addEventListener('click',()=>onRetry());
   content.append(mark,heading,description,note,retry);
   shield.append(content);
   document.body.append(shield);
  }
  description.textContent=String(message);
  retry.hidden=!retryable;
  retry.disabled=!retryable;
 }
 function close(){
  if(!shield)return;
  shield.remove();shield=description=retry=null;
  document.body.classList.remove('lts-driver-session-blocked');
  root.inert=previousInert;
 }
 return {show,close,isVisible:()=>Boolean(shield)};
}
