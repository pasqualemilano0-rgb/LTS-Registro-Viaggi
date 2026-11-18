/** Two ordered delivery customers, one centrally approved fare.
 * UI is never a price authority: lts-company-tariffs checks JWT, role, MFA, revisions.
 */
const byId=id=>document.getElementById(id);
const clean=value=>String(value??'').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
const euro=value=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(value/100);
const text=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e};
function parseCents(value){
 const str=String(value??'').replace(/[€\s]/gu,'').trim();
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(str))
  throw new Error('Importo non valido: usa 150 oppure 150,50.');
 const [major,minor='']=str.replace(/\./gu,'').split(',');
 const cents=Number(major)*100+Number(minor.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<0||cents>99999999)throw new Error('Importo fuori limite.');
 return cents;
}
export function setupCompanyMultiStopRates(account,{onSaved}={}){
 const form=byId('company-multi-form'),list=byId('company-multi-list'),
  status=byId('company-multi-status'),save=byId('company-multi-save'),
  cancel=byId('company-multi-cancel'),active=byId('company-multi-active'),
  amount=byId('company-multi-amount'),heading=byId('company-multi-form-title');
 const client=byId('company-multi-client'),city=byId('company-multi-city'),
  secondClient=byId('company-multi-second-client'),secondCity=byId('company-multi-second-city');
 const customerNames=byId('company-multi-customers');
 let rows=[],sites=[],loaded=false,editing=null,busy=false;
 const allowed=()=>account.isVerified()&&account.getRole()==='admin';
 const feedback=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error)};
 function validSite(name,place){return sites.some(s=>clean(s.name)===name&&clean(s.city)===place)}
 function refreshOptions(){
  const names=[...new Set(sites.map(site=>clean(site.name)))].sort((a,b)=>a.localeCompare(b,'it'));
  customerNames.replaceChildren(...names.map(name=>{const e=document.createElement('option');e.value=name;return e}));
  for(const [n,c,id] of [[client,city,'company-multi-cities-a'],[secondClient,secondCity,'company-multi-cities-b']]){
   const places=[...new Set(sites.filter(s=>clean(s.name)===clean(n.value)).map(s=>clean(s.city)))];
   byId(id).replaceChildren(...places.map(place=>{const e=document.createElement('option');e.value=place;return e}));
   if(!c.value.trim()&&places.length===1)c.value=places[0];
  }
 }
 function resetForm(){
  editing=null;form.reset();active.checked=true;
  for(const control of [client,city,secondClient,secondCity])control.disabled=false;
  heading.textContent='Autorizza scarico multiplo';save.textContent='Salva tariffa unica';
  cancel.hidden=true;refreshOptions();
 }
 function edit(row){
  if(!allowed()||!loaded||busy)return;
  editing=row;client.value=row.client;city.value=row.city;
  secondClient.value=row.secondClient;secondCity.value=row.secondCity;
  amount.value=(row.cents/100).toFixed(2).replace('.',',');active.checked=row.enabled;
  for(const control of [client,city,secondClient,secondCity])control.disabled=true;
  heading.textContent='Modifica tariffa unica';save.textContent='Aggiorna tariffa';
  cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});amount.focus({preventScroll:true});
 }
 function render(){
  list.replaceChildren();
  if(!loaded)list.append(text('p','company-rates-note','Elenco non verificato: modifiche temporaneamente disabilitate.'));
  if(!rows.length){list.append(text('p','company-rates-note','Non ci sono coppie con tariffa unica autorizzata. La seconda presa a due tariffe resta disponibile.'));return;}
  for(const row of rows){
   const article=document.createElement('article');article.className='company-rate-row';
   const main=text('div','company-rate-main','');
   main.append(text('strong','company-rate-name',row.client+' · '+row.city),
    text('span','company-rate-city','Poi '+row.secondClient+' · '+row.secondCity),
    text('small','company-rate-updated',row.enabled?'Tariffa unica attiva':'Tariffa unica disattivata'));
   const price=text('strong','company-rate-price',euro(row.cents));
   const button=text('button','button outline company-rate-edit','Modifica');
   button.type='button';button.disabled=!loaded||!allowed()||busy;
   button.addEventListener('click',()=>edit(row));article.append(main,price,button);list.append(article);
  }
 }
 function update(newRows,newSites,verified,verifiedSites){
  if(!allowed()){reset();return;}
  if(Array.isArray(newRows))rows=newRows;
  if(Array.isArray(newSites))sites=newSites;
  loaded=Boolean(verified&&verifiedSites&&Array.isArray(newRows));
  if(!form.contains(document.activeElement))refreshOptions();
  save.disabled=!loaded||busy;render();
  if(!loaded)feedback('Tariffe multiple non disponibili o elenco sedi non sincronizzato: nessuna modifica possibile.',true);
  else if(!busy)feedback(rows.length+' coppie censite. Solo l’amministratore può modificarle.');
 }
 function reset(){
  rows=[];sites=[];loaded=false;busy=false;resetForm();
  save.disabled=true;render();feedback('Apri Tariffe aziendali per caricare le coppie autorizzate.');
 }
 for(const el of [client,secondClient])el.addEventListener('input',refreshOptions);
 cancel.addEventListener('click',resetForm);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!allowed()||!loaded||busy)return;
  let payload;
  try{
   const a=clean(client.value),ac=clean(city.value),b=clean(secondClient.value),bc=clean(secondCity.value);
   if(a.length<2||b.length<2||!validSite(a,ac)||!validSite(b,bc))
    throw new Error('Seleziona due clienti e località presenti nell’anagrafica aziendale.');
   if(a===b&&ac===bc)throw new Error('I punti di scarico devono essere distinti.');
   payload={client:a,city:ac,secondClient:b,secondCity:bc,cents:parseCents(amount.value),enabled:active.checked};
   if(editing)Object.assign(payload,{id:editing.id,expectedRevision:editing.revision});
  }catch(error){feedback(error.message,true);return;}
  busy=true;save.disabled=true;
  feedback('Verifica amministrativa e salvataggio tariffa unica in corso…');
  try{
   await account.companyTariffs('multi-save',payload);
   resetForm();await onSaved?.();
   feedback('Tariffa multipla salvata. Gli autisti la vedranno al prossimo aggiornamento online.');
  }catch(error){feedback(error?.message||'Salvataggio tariffa multipla non riuscito.',true)}
  finally{busy=false;save.disabled=!loaded;render()}
 });
 reset();
 return {update,reset};
}
