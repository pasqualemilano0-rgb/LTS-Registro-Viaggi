/* v0.30: un solo selettore visibile, scorciatoie accessibili CNT/TFG. */
const get=id=>document.getElementById(id);
const bookingDetails=get('napoli-booking-details');
const advanced=get('napoli-advanced');
const input=get('sct-filter');
const button=get('sct-search-btn');
const found=get('sct-vessel-results');
const shortcuts=get('napoli-shortcuts');
const cntPanel=get('cnt-fleet');
const tfgPanel=get('tfg-fleet');
const terminalSwitch=get('napoli-terminal-switch');

// La selezione visiva e il pannello operativo devono rimanere sempre coerenti.
// Non dipendiamo soltanto dagli event listener dell'altro script app.js.
function syncNapoliTerminalPanels(){
  const napoli=document.querySelector('input[name="port"]:checked')?.value!=='salerno';
  const selected=document.querySelector('input[name="napoli-terminal"]:checked')?.value||'cnt';
  // Le radio rimangono come stato interno; gli unici comandi visibili sono
  // i due pulsanti grandi nella schermata principale.
  terminalSwitch.hidden=true;
  tfgPanel.hidden=!napoli||selected!=='tfg';
  cntPanel.hidden=!napoli||selected!=='cnt';
  shortcuts.querySelectorAll('button[data-open-terminal]').forEach(button=>{
    button.setAttribute('aria-pressed',String(napoli&&button.dataset.openTerminal===selected));
  });
}

document.querySelectorAll('input[name="napoli-terminal"]').forEach(r=>r.addEventListener('change',syncNapoliTerminalPanels));

function syncSearchLabel(){
  const hasTerm=input.value.trim().length>0;
  button.textContent=hasTerm?'⌕  CERCA NAVE':'☰  VEDI NAVI';
  button.disabled=false;
}

function syncPort(){
  const napoli=document.querySelector('input[name="port"]:checked')?.value!=='salerno';
  advanced.hidden=!napoli;
  shortcuts.hidden=!napoli;
  syncNapoliTerminalPanels();
  if(napoli){
    bookingDetails.open=true;
    get('search-btn').firstChild.textContent=
      document.querySelector('input[name="napoli-terminal"][value="tfg"]:checked')
        ?'⌕  CERCA BOOKING TFG ':'⌕  CERCA BOOKING CNT ';
  }
  // La sezione è interna al picker SCT, già nascosto quando si usa Napoli.
  // Non occultare le navi quando il nome nave è vuoto o cambia il porto.
  found.hidden=false;
  syncSearchLabel();
}

document.querySelectorAll('input[name="port"]').forEach(r=>r.addEventListener('change',syncPort));
syncPort();

input.addEventListener('input',syncSearchLabel);
input.addEventListener('keydown',event=>{
  if(event.key==='Enter'){
    event.preventDefault();
    button.click();
  }
});
button.addEventListener('click',()=>{
  const entries=[...get('sct-vessel-list').querySelectorAll('button[data-vessel-index]')];
  const count=get('sct-vessel-count').textContent;
  if(input.value.trim() && entries.length===1 && count.startsWith('1 ')){
    entries[0].click();
  }else{
    found.scrollIntoView({behavior:'smooth',block:'start'});
  }
});

/* Un tocco sul terminal apre il relativo elenco; nessuna verifica booking automatica. */
shortcuts.addEventListener('click',event=>{
  const target=event.target.closest('button[data-open-terminal]');
  if(!target||!shortcuts.contains(target))return;
  const terminal=target.dataset.openTerminal;
  if(terminal!=='cnt'&&terminal!=='tfg')return;
  const radio=document.querySelector('input[name="napoli-terminal"][value="'+terminal+'"]');
  if(!radio)return;
  advanced.hidden=false;
  advanced.open=true;
  const alreadySelected=radio.checked;
  if(!alreadySelected){
    radio.checked=true;
    radio.dispatchEvent(new Event('change',{bubbles:true}));
  }
  // Sincronizza comunque, anche quando il radio era già spuntato o app.js
  // ha interrotto la propria inizializzazione per un errore di rete/rendering.
  syncNapoliTerminalPanels();
  const targetPanel=get(terminal==='tfg'?'tfg-fleet':'cnt-fleet');
  // Quando l'autista entra nel terminal TFG, non riutilizzare soltanto
  // il caricamento di apertura della pagina: interroga nuovamente /api/tfg.
  if(alreadySelected)get(terminal==='tfg'?'tfg-reload':'cnt-reload').click();
  // L'apertura del pannello è sincrona: porta subito in vista la lista.
  window.requestAnimationFrame(()=>{
    targetPanel.scrollIntoView({
      behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
      block:'start'
    });
  });
});

/** Compact, authenticated Porti homepage. Reuse committed terminal PNGs rather
 * than approximated logos. All legacy booking fields, state and listeners remain. */
function setupPortiHomepage(){
 const main=document.querySelector('.shell main');
 const search=document.querySelector('.search-panel');
 const form=get('search-form');
 const notice=document.querySelector('.driver-notice');
 if(!main||!search||!form||get('lts-porti-terminals'))return;
 const make=(tag,cls,value='')=>{
  const result=document.createElement(tag);
  if(cls)result.className=cls;
  if(value)result.textContent=value;
  return result;
 };
 const links=make('section','lts-porti-officials');
 links.id='lts-porti-terminals';
 links.setAttribute('aria-labelledby','lts-porti-links-title');
 const title=make('h2','lts-porti-officials-title','Terminal e collegamenti ufficiali');
 title.id='lts-porti-links-title';
 const intro=make('p','lts-porti-officials-intro','Siti e servizi dei terminal. Controlla sempre le indicazioni ufficiali.');
 const grid=make('div','lts-porti-official-grid');
 const terminals=[
  {name:'CO.NA.TE.CO.',alt:'Logo CO.NA.TE.CO.',image:'conateco.png',
   href:'https://www.conateco.it/booking-export/',width:250,height:71},
  {name:'TFG · Terminal Flavio Gioia',alt:'Logo TFG · Terminal Flavio Gioia',
   image:'tfg-portal.png',href:'https://tfg.bucci.it/@/TFGW_TP_ETA',width:182,height:122},
  {name:'SCT · Salerno Container Terminal',alt:'Logo SCT · Salerno Container Terminal',
   image:'sct-compact.png',href:'https://www.salernocontainerterminal.com/vessel-schedule/',
   width:182,height:90}
 ];
 for(const item of terminals){
  const link=document.createElement('a');
  link.className='lts-porti-terminal-link';link.href=item.href;
  link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label','Apri sito ufficiale '+item.name+' in una nuova scheda');
  const plate=make('span','lts-porti-terminal-plate');
  const image=document.createElement('img');
  image.src='assets/terminal-logos/'+item.image;
  image.alt=item.alt;image.width=item.width;image.height=item.height;
  image.loading='lazy';image.decoding='async';
  plate.append(image);
  link.append(plate,make('span','lts-porti-terminal-action','Accedi al sito ↗'));
  grid.append(link);
 }
 links.append(title,intro,grid);
 search.insertAdjacentElement('afterend',links);
 const tools=make('details','lts-porti-operational');
 tools.id='lts-porti-operational';
 const summary=make('summary','lts-porti-operational-toggle','Verifica booking e consulta navi');
 tools.append(summary,form);
 links.insertAdjacentElement('afterend',tools);
 // Move safety information below the short official-link cards.
 if(notice)tools.insertAdjacentElement('afterend',notice);
 const changeTitle=()=>{
  const city=document.querySelector('input[name="port"]:checked')?.value;
  summary.textContent=city==='salerno'?'Consulta il programma navi SCT':
    'Verifica booking e consulta navi · Napoli';
  // Keep the home screen compact for both ports. Operations open on demand.
 };
 document.querySelectorAll('input[name="port"]').forEach(r=>r.addEventListener('change',changeTitle));
 changeTitle();
}
setupPortiHomepage();

// The LTS shell already supplies its own heading when this document is embedded.
document.documentElement.classList.toggle('lts-embedded', window.self !== window.top);
