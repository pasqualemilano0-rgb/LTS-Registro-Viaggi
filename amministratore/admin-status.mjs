// LTS service-status view, visible only after verified administrator MFA.
// Public GitHub Actions data is not confidential; never include account details.
const API='https://api.github.com/repos/pasqualemilano0-rgb/LTS-Registro-Viaggi/actions/runs?branch=main&per_page=100';
const MONITOR='LTS Control Center — monitor disponibilita gratuito';
const DEPLOY='pages build and deployment';
const STALE_MS=3*60*60*1000;

export function summarizeAdminRuns(runs,now=Date.now()){
  const latest=name=>runs.find(run=>run.name===name)||null;
  const monitor=latest(MONITOR),deploy=latest(DEPLOY);
  const stamp=run=>new Date(run?.run_started_at||run?.created_at||'').getTime();
  const monitorTime=stamp(monitor);
  const monitorStale=!monitor||!Number.isFinite(monitorTime)||
    monitorTime>now+60_000||now-monitorTime>STALE_MS;
  const health=monitorStale?'non recente':
    monitor.status!=='completed'?'in esecuzione':
    monitor.conclusion==='success'?'superato':'anomalia';
  const release=!deploy?'non disponibile':
    deploy.status!=='completed'?'in corso':
    deploy.conclusion==='success'?'riuscita':'anomalia';
  return {health,release,monitorTime:monitorTime||null,deployTime:stamp(deploy)||null};
}

export function setupAdminStatus(account){
  const button=document.getElementById('admin-status-refresh');
  const summary=document.getElementById('admin-status-result');
  const monitor=document.getElementById('admin-status-monitor');
  const deploy=document.getElementById('admin-status-deploy');
  const stamp=document.getElementById('admin-status-time');
  if(!button||!summary||!monitor||!deploy||!stamp)return {reset(){}};
  let request=0;
  function authorized(){
    return account.hasSession()&&account.isVerified()&&account.getRole()==='admin'&&
      !document.getElementById('dashboard').hidden&&document.getElementById('mfa-panel').hidden;
  }
  function reset(message='Stato non caricato. Richiede sessione amministratore e MFA.'){
    request++;
    summary.textContent=message;
    monitor.textContent='—';deploy.textContent='—';stamp.textContent='—';
    button.disabled=false;
  }
  async function refresh(){
    if(!authorized()){reset('Accesso amministratore non verificato.');return;}
    const current=++request,owner=account.getAccountId();
    button.disabled=true;
    summary.textContent='Verifico la sessione amministratore…';
    try{
      const session=await account.verifySession();
      if(!authorized()||owner!==account.getAccountId()||
         session?.mfa_enrolled!==true||session?.mfa_verified!==true){
        reset('Per consultare LTS Stato occorre completare il login amministratore con MFA.');
        return;
      }
      summary.textContent='Leggo i controlli tecnici…';
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),12000);
      let result;
      try{
        const response=await fetch(API,{headers:{Accept:'application/vnd.github+json'},
          cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
        if(!response.ok)throw new Error('GitHub API HTTP '+response.status);
        result=await response.json();
      }finally{clearTimeout(timer);}
      if(current!==request||!authorized()||owner!==account.getAccountId())return;
      if(!Array.isArray(result.workflow_runs))throw new Error('Dati GitHub non validi');
      const state=summarizeAdminRuns(result.workflow_runs);
      monitor.textContent=state.health;
      deploy.textContent=state.release;
      stamp.textContent=state.monitorTime&&Number.isFinite(state.monitorTime)?
        new Date(state.monitorTime).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'}):'non disponibile';
      summary.textContent='Solo stato tecnico. Nessun dato aziendale consultato.';
    }catch{
      if(current!==request)return;
      summary.textContent='Verifica non riuscita. Non significa che LTS sia offline.';
      monitor.textContent='non verificato';deploy.textContent='non verificato';stamp.textContent='—';
    }finally{
      if(current===request)button.disabled=false;
    }
  }
  button.addEventListener('click',()=>{void refresh();});
  window.addEventListener('lts-account-locked',()=>reset());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  return {reset};
}
