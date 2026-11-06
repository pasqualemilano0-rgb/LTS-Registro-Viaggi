/** Admin-only company price catalog. Never touches a driver's private archive. */
const get=id=>document.getElementById(id);
const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=value;return n;};
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
  title=get('company-rates-form-title');
 let rows=[],editing=null,generation=0,busy=false;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !get('dashboard').hidden&&get('dashboard').dataset.view==='rates';
 const feedback=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
 function clearForm(){
  editing=null;form.reset();client.disabled=false;city.disabled=false;
  title.textContent='Nuova tariffa';submit.textContent='Salva tariffa';cancel.hidden=true;
 }
 function render(){
  const term=clean(search.value);
  const visible=rows.filter(r=>(r.client+' '+r.city).includes(term));
  count.textContent=rows.length+' tariffe aziendali · '+visible.length+' visualizzate';
  list.replaceChildren();
  if(!visible.length)list.append(node('p','company-rates-empty',
    rows.length?'Nessuna tariffa corrisponde alla ricerca.':'Nessuna tariffa aziendale ancora inserita.'));
  for(const tariff of visible){
   const row=document.createElement('article');row.className='company-rate-row';
   const info=node('div','company-rate-main','');
   info.append(node('strong','company-rate-name',tariff.client),
    node('span','company-rate-city',tariff.city),
    node('small','company-rate-updated','Aggiornata '+new Date(tariff.updatedAt).toLocaleDateString('it-IT')));
   const price=node('strong','company-rate-price',money(tariff.cents));
   const edit=document.createElement('button');edit.type='button';edit.className='button outline company-rate-edit';
   edit.textContent='Modifica';edit.setAttribute('aria-label','Modifica tariffa '+tariff.client+', '+tariff.city);
   edit.addEventListener('click',()=>{
    editing=tariff;title.textContent='Modifica tariffa';client.value=tariff.client;city.value=tariff.city;
    amount.value=(tariff.cents/100).toFixed(2).replace('.',',');
    client.disabled=true;city.disabled=true;cancel.hidden=false;
    submit.textContent='Aggiorna importo';pane.querySelector('#company-rates-editor').scrollIntoView({block:'start',behavior:'smooth'});
    amount.focus({preventScroll:true});
   });
   row.append(info,price,edit);list.append(row);
  }
 }
 function reset(){
  generation++;rows=[];busy=false;search.value='';list.replaceChildren();
  clearForm();count.textContent='—';feedback('Apri Tariffe aziendali per caricare i dati.');
  refresh.disabled=false;submit.disabled=false;
 }
 async function load(){
  if(!authorized()){reset();return;}
  const seq=++generation;refresh.disabled=true;feedback('Caricamento tariffario protetto…');
  try{
   const result=await account.companyTariffs('list');
   if(seq!==generation||!authorized())return;
   if(!Array.isArray(result?.tariffs))throw new Error('Tariffario incompleto.');
   rows=result.tariffs;render();
   feedback('Tariffe aziendali aggiornate. Gli importi già registrati dai singoli autisti non vengono sovrascritti.');
  }catch(e){
   if(seq!==generation)return;
   rows=[];list.replaceChildren();count.textContent='—';
   feedback(e?.message||'Impossibile caricare le tariffe.',true);
  }finally{if(seq===generation)refresh.disabled=false;}
 }
 cancel.addEventListener('click',clearForm);
 search.addEventListener('input',render);
 refresh.addEventListener('click',()=>void load());
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!authorized())return;
  let payload;
  try{
   const name=clean(client.value),place=clean(city.value),cents=toCents(amount.value);
   if(name.length<2||name.length>500||place.length<1||place.length>500)
    throw new Error('Inserisci cliente e località validi.');
   payload={client:name,city:place,cents};
   if(editing)Object.assign(payload,{id:editing.id,expectedRevision:editing.revision});
  }catch(e){feedback(e.message,true);return;}
  busy=true;submit.disabled=true;refresh.disabled=true;
  feedback('Salvataggio tariffa in corso…');
  try{
   await account.companyTariffs('save',payload);
   clearForm();
   await load();
   if(authorized()&&rows.length)
    feedback('Tariffa salvata. I viaggi senza importo vengono ricalcolati nei report; gli autisti ricevono il prezzo al prossimo accesso o aggiornamento online.');
  }catch(e){
   feedback(e?.message||'Tariffa non salvata. Riprova.',true);
  }finally{busy=false;submit.disabled=false;if(authorized())refresh.disabled=false;}
 });
 reset();
 return {load,reset};
}
