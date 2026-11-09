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
    const monitorResponse=await getJSON(api+'/actions/workflows/lts-uptime-monitor.yml/runs?branch=main&per_page=1');
    const monitor=monitorResponse.workflow_runs?.[0]||null;
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
    const history=await getJSON(api+'/actions/runs?branch=main&per_page=50');
    const runs=history.workflow_runs||[];
    const deploy=findLatest(runs,r=>r.name==='pages build and deployment');
    const qa=findLatest(runs,r=>r.name==='QA release LTS Autisti — Fase 1');
    // Historical success means last release passed, NOT current availability.
    const historical=r=>!r||r.status!=='completed'?'waiting':r.conclusion==='success'?'ok':'fail';
    setState('s-deploy',historical(deploy));
    setState('s-qa',historical(qa));
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
  update();
}
