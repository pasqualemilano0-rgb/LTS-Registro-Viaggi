const api = 'https://api.github.com/repos/pasqualemilano0-rgb/LTS-Registro-Viaggi';
const monitoredSteps = Object.freeze({
  site:'Sito pubblico', admin:'Pannello amministratore',
  bundle:'Bundle JavaScript', auth:'API login (solo preflight CORS)'
});
const MAX_AGE_MS = 150 * 60 * 1000;
export function classifyRun(run, now=Date.now()) {
  if (!run) return 'waiting';
  const time=Date.parse(run.run_started_at || run.created_at || '');
  if (!Number.isFinite(time) || time > now + 60000 || now-time > MAX_AGE_MS) return 'stale';
  if (run.status !== 'completed') return 'waiting';
  return run.conclusion === 'success' ? 'ok' : 'fail';
}
export function classifyStep(step, state) {
  if (state==='stale' || state==='waiting') return state;
  if (!step || step.status!=='completed') return 'waiting';
  if (step.conclusion==='success') return 'ok';
  if (step.conclusion==='failure' || step.conclusion==='timed_out') return 'fail';
  return 'waiting';
}
export function summarize(states) {
  if (states.includes('fail')) return 'fail';
  if (states.includes('stale')) return 'stale';
  if (states.includes('waiting')) return 'waiting';
  return states.length && states.every(s=>s==='ok') ? 'ok' : 'waiting';
}
export function findLatest(runs,predicate) {
  return runs.find(predicate)||null;
}

// Optional on-device notifications only while this page is open.
// Background alerts are provided separately by the user's ChatGPT automation.
const ALERT_ENABLED_KEY='lts-control-local-alerts-v1';
const LAST_ALERT_KEY='lts-control-last-alert-v1';
const STATUS_URL='/LTS-Registro-Viaggi/status/';
let installPromptEvent=null;

export function incidentFor(monitor, monitorState, componentStates, deploy) {
  if (monitor?.id && monitorState === 'fail' && componentStates.some(s=>s==='fail'))
    return {id:'monitor-'+monitor.id,body:'Un controllo pubblico del servizio LTS ha segnalato un problema.'};
  if (deploy?.id && deploy.status==='completed' && deploy.conclusion==='failure')
    return {id:'deploy-'+deploy.id,body:'L’ultima pubblicazione del sito LTS è fallita.'};
  return null;
}
function storageRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageWrite(key,value) {
  try { localStorage.setItem(key,value); return true; } catch { return false; }
}
function installed() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}
async function notifyLocal(incident) {
  if (!incident || storageRead(ALERT_ENABLED_KEY)!=='yes'
      || typeof Notification==='undefined' || Notification.permission!=='granted'
      || !('serviceWorker' in navigator) || storageRead(LAST_ALERT_KEY)===incident.id) return;
  try {
    const registration=await navigator.serviceWorker.getRegistration(STATUS_URL);
    if(!registration?.active) return;
    await registration.showNotification('LTS Control Center — anomalia',{
      body:incident.body,icon:'/LTS-Registro-Viaggi/assets/icon-192.png',
      badge:'/LTS-Registro-Viaggi/assets/icon-192.png',
      tag:'lts-control-incident',data:{url:STATUS_URL}
    });
    storageWrite(LAST_ALERT_KEY,incident.id);
  } catch {
    // No false success claims: browser/device may reject notifications.
  }
}
function refreshAlertButton() {
  const button=document.getElementById('enable-alerts');
  const hint=document.getElementById('alerts-hint');
  if (!button||!hint) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    button.disabled=true;
    hint.textContent='Questo browser non supporta gli avvisi locali. Usa le notifiche ChatGPT per gli avvisi in background.';
    return;
  }
  const enabled=storageRead(ALERT_ENABLED_KEY)==='yes' && Notification.permission==='granted';
  button.textContent=enabled?'Disattiva avvisi locali':'Attiva avvisi locali';
  button.setAttribute('aria-pressed',String(enabled));
  if(enabled) hint.textContent='Avvisi locali attivi mentre il pannello è aperto. A pannello chiuso usa gli avvisi ChatGPT.';
  else if(Notification.permission==='denied') hint.textContent='Notifiche bloccate nel browser: riabilitale dalle impostazioni del sito. A pannello chiuso usa ChatGPT.';
  else hint.textContent='Gli avvisi locali funzionano solo mentre il pannello è aperto. Per avvisi a pannello chiuso usa ChatGPT.';
}
async function initPWA() {
  const install=document.getElementById('install-pwa');
  const installHint=document.getElementById('install-hint');
  const setInstalled=()=>{
    install.hidden=true;
    installHint.textContent='Control Center installato sul dispositivo.';
  };
  if (installed()) setInstalled();
  window.addEventListener('beforeinstallprompt',event=>{
    if (installed()) return;
    event.preventDefault();
    installPromptEvent=event;
    install.hidden=false;
  });
  // Capture install prompt before SW registration: the browser can fire it immediately.
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js',{scope:'./'}); }
    catch { installHint.textContent='La modalità offline non è disponibile su questo browser; puoi aprire comunque il pannello dal link.'; }
  }
  window.addEventListener('appinstalled',setInstalled);
  install.addEventListener('click',async()=>{
    if (!installPromptEvent) {
      installHint.textContent='Android Chrome: menu ⋮ → Installa app. iPhone Safari: Condividi → Aggiungi alla schermata Home.';
      return;
    }
    const event=installPromptEvent;
    installPromptEvent=null;
    try {
      await event.prompt();
      const choice=await event.userChoice;
      installHint.textContent=choice?.outcome==='accepted'?'Installazione accettata.':'Puoi installarla dal menu del browser in qualsiasi momento.';
    } catch {
      installHint.textContent='Usa il comando Installa app nel menu del browser.';
    }
  });
  document.getElementById('enable-alerts')?.addEventListener('click',async()=>{
    if(storageRead(ALERT_ENABLED_KEY)==='yes') {
      storageWrite(ALERT_ENABLED_KEY,'no');
      refreshAlertButton();
      return;
    }
    if(typeof Notification==='undefined') return;
    try {
      const permission=await Notification.requestPermission();
      if(permission==='granted') storageWrite(ALERT_ENABLED_KEY,'yes');
    } catch {}
    refreshAlertButton();
  });
  refreshAlertButton();
}

const labels={ok:'Operativo',fail:'Anomalia',stale:'Dati non recenti',waiting:'Non verificato'};
function setState(id,state) {
  const el=document.getElementById(id);
  el.className=(id==='overall'?'pill ':'state ')+state;
  el.textContent=id==='overall'?{ok:'Controlli superati',fail:'Anomalia rilevata',stale:'Verifiche non recenti',waiting:'Verifica non disponibile'}[state]:labels[state];
}
function formattedDate(iso) {
  const date=new Date(iso||'');
  return Number.isFinite(date.getTime()) ? date.toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'}) : 'non disponibile';
}
async function getJSON(url) {
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
  if (!response.ok) throw new Error('GitHub API HTTP '+response.status);
  return response.json();
}
async function update() {
  const button=document.getElementById('refresh');
  button.disabled=true;
  document.getElementById('info').textContent='Recupero stato da GitHub…';
  try {
    const history=await getJSON(api+'/actions/runs?branch=main&per_page=100');
    const runs=history.workflow_runs||[];
    const monitor=findLatest(runs,r=>r.name==='LTS Control Center — monitor disponibilita gratuito');
    const monitorState=classifyRun(monitor);
    let job=null;
    if (monitor) {
      const result=await getJSON(api+'/actions/runs/'+monitor.id+'/jobs?per_page=30');
      job=result.jobs?.find(j=>j.name==='availability')||null;
    }
    const steps=job?.steps||[];
    const states=[];
    for (const [key,name] of Object.entries(monitoredSteps)) {
      const state=classifyStep(steps.find(step=>step.name===name),monitorState);
      setState('s-'+key,state);
      states.push(state);
    }
    setState('overall',summarize([...states,monitorState]));
    document.getElementById('last-check').textContent='Ultimo controllo: '+formattedDate(monitor?.run_started_at||monitor?.created_at);
    const deploy=findLatest(runs,r=>r.name==='pages build and deployment');
    const qa=findLatest(runs,r=>r.name==='QA release LTS Autisti — Fase 1');
    // Historical success means last release passed, NOT current availability.
    const historical=r=>!r||r.status!=='completed'?'waiting':r.conclusion==='success'?'ok':'fail';
    setState('s-deploy',historical(deploy));
    setState('s-qa',historical(qa));
    void notifyLocal(incidentFor(monitor,monitorState,states,deploy));
    document.getElementById('deploy-time').textContent='Ultimo workflow: '+formattedDate(deploy?.created_at);
    document.getElementById('qa-time').textContent='Ultimo workflow: '+formattedDate(qa?.created_at);
    document.getElementById('info').textContent=monitor
      ? 'Fonte: GitHub Actions pubblico. Ultimi controlli in sola lettura.'
      : 'Monitor non ancora eseguito: la prima verifica verrà avviata dal workflow.';
  } catch(error) {
    for (const key of Object.keys(monitoredSteps)) setState('s-'+key,'waiting');
    for (const key of ['deploy','qa']) setState('s-'+key,'waiting');
    setState('overall','waiting');
    document.getElementById('last-check').textContent='Ultimo controllo: non disponibile';
    document.getElementById('info').textContent='Dati GitHub non disponibili. Questo non implica che il sito sia offline. '+error.message;
  } finally {button.disabled=false;}
}
if (typeof document!=='undefined') {
  document.getElementById('refresh')?.addEventListener('click',update);
  void initPWA();
  void update();
  // Poll only while visible; the standalone app cannot poll after being closed.
  window.setInterval(()=>{if(document.visibilityState==='visible') void update();},10*60*1000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') void update();});
}
