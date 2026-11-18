import * as account from '../account-access.mjs';
import * as api from './document-api.mjs';
const $=id=>document.getElementById(id);
let category='cedolino',offset=0,busy=false;
const months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function note(message='',error=false){
 $('notice').textContent=message;$('notice').hidden=!message;
 $('notice').classList.toggle('error',error);
}
function element(tag,cls,text){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
function locked(message=''){
 $('content').hidden=true;$('locked').hidden=false;
 $('documents').replaceChildren();
 if(message)note(message,true);
}
async function authenticate(){
 $('content').hidden=true;$('locked').hidden=true;
 try{
  if(!account.hasSession())await account.restoreDriverSession();
  const status=await account.verifySession();
  if(status.role!=='driver'||!account.isVerified()){locked('Accedi con un account autista.');return;}
  $('content').hidden=false;
  await load();
 }catch(error){locked(error.message||'Verifica account non disponibile.');}
}
function display(doc){
 const row=element('article','document-row');
 const details=element('div');
 details.append(element('strong','',doc.label));
 const month=doc.document_month?months[doc.document_month-1]+' ':'';
 details.append(element('small','',month+doc.document_year+' · '+doc.original_filename));
 const actions=element('div','actions');
 const button=element('button','outline','Scarica PDF');
 button.type='button';
 button.addEventListener('click',async()=>{
  button.disabled=true;note('');
  try{
   const file=await api.download(doc.id);
   api.savePdf(file,doc.original_filename);
  }catch(error){note(error.message||'Download non disponibile.',true);}
  finally{button.disabled=false;}
 });
 actions.append(button);row.append(details,actions);
 return row;
}
async function load(append=false){
 if(busy||$('content').hidden)return;
 busy=true;$('refresh').disabled=true;$('more').disabled=true;
 if(!append){offset=0;$('documents').replaceChildren();}
 try{
  const filter={category,offset};
  if($('year').value)filter.year=Number($('year').value);
  const result=await api.documents(filter);
  if(!Array.isArray(result.documents))throw Error('Archivio documenti non valido.');
  for(const doc of result.documents){
   if(doc.state!=='published'||!['cedolino','cu','altri'].includes(doc.category))
    throw Error('Risposta documenti non autorizzata.');
   $('documents').append(display(doc));
  }
  offset+=result.documents.length;
  $('more').hidden=result.documents.length<50;
  if(!offset)$('documents').append(element('p','hint','Non ci sono documenti pubblicati in questa categoria.'));
  note('');
 }catch(error){note(error.message||'Impossibile aggiornare i documenti.',true);}
 finally{busy=false;$('refresh').disabled=false;$('more').disabled=false;}
}
for(const button of document.querySelectorAll('[data-category]')){
 button.addEventListener('click',()=>{
  category=button.dataset.category;
  for(const item of document.querySelectorAll('[data-category]')){
   const chosen=item===button;item.classList.toggle('selected',chosen);
   item.setAttribute('aria-pressed',String(chosen));
  }
  $('category-title').textContent=category==='cedolino'?'CEDOLINO':category==='cu'?'CU':'ALTRI DOCUMENTI';
  void load();
 });
}
const current=new Date().getFullYear();
for(let year=current+1;year>=2020;year--){
 const option=document.createElement('option');
 option.value=String(year);option.textContent=String(year);$('year').append(option);
}
$('year').addEventListener('change',()=>void load());
$('refresh').addEventListener('click',()=>void authenticate());
$('more').addEventListener('click',()=>void load(true));
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!$('content').hidden)void authenticate();
});
setInterval(()=>{
 if(document.visibilityState==='visible'&&!busy&&!$('content').hidden)void authenticate();
},120000);
void authenticate();
