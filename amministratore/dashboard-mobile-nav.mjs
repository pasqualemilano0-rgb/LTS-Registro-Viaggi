/* LTS admin: navigation presentation only; no auth, API or archive access. */
const dashboard=document.getElementById('dashboard');
const more=document.getElementById('admin-nav-more');
if(dashboard&&more){
  const query=window.matchMedia('(max-width: 1029px)');
  const summary=more.querySelector('summary');
  const extraViews=new Set(['records','alerts','rates','exports','security','analysis']);
  function syncMode(){
    // The desktop sidebar must expose all authorized navigation actions.
    more.open=!query.matches;
  }
  // Related navigation delegates to the existing, authorized route handlers.
  // No new data source, session persistence or permission decisions.
  const related=document.getElementById('workspace-related');
  const links={
    drivers:[['Registro viaggi','#report-tab'],['Archivi autisti','#records-tab'],['Sicurezza','#security-tab']],
    trips:[['Autisti','#management-tab'],['Clienti','#customers-tab'],['Analisi','#analysis-tab'],['Report PDF / Excel','#exports-tab']],
    customers:[['Nuovo da Maps','[data-open-maps]'],['Nuovo manuale','[data-open-manual]'],['Tariffe','#rates-tab']],
    rates:[['Clienti','#customers-tab'],['Nuovo da Maps','[data-open-maps]'],['Nuovo manuale','[data-open-manual]']],
    records:[['Autisti','#management-tab'],['Registro viaggi','#report-tab']],
    analysis:[['Registro viaggi','#report-tab'],['Anomalie','#alerts-tab'],['Report PDF / Excel','#exports-tab']],
    alerts:[['Registro viaggi','#report-tab'],['Analisi','#analysis-tab'],['Archivi autisti','#records-tab']],
    exports:[['Registro viaggi','#report-tab'],['Analisi','#analysis-tab']],
    security:[['Autisti','#management-tab'],['Home','#overview-tab']],
    approvals:[['Clienti','#customers-tab'],['Tariffe','#rates-tab'],['Home','#overview-tab']]
  };
  let lastContext=null;
  function syncRelated(){
    if(!related)return;
    const view=dashboard.dataset.view==='overview'?dashboard.dataset.homeSection||'overview':dashboard.dataset.view;
    const items=links[view]||[];
    if(view===lastContext)return;
    lastContext=view;
    related.replaceChildren();
    related.hidden=!items.length;
    for(const [label,selector] of items){
      const button=document.createElement('button');
      button.type='button';button.textContent=label;button.dataset.relatedTarget=selector;
      button.addEventListener('click',()=>{
        if(dashboard.hidden||dashboard.inert||document.hidden)return;
        const target=document.querySelector(selector);
        if(!target||target.disabled)return;
        target.click();
      });
      related.append(button);
    }
  }
  function syncSelection(){
    const customer=dashboard.dataset.view==='overview'&&dashboard.dataset.homeSection==='customers';
    const approvals=dashboard.dataset.view==='overview'&&dashboard.dataset.homeSection==='approvals';
    const active=extraViews.has(dashboard.dataset.view)||approvals;
    const home=document.getElementById('overview-tab'),clients=document.getElementById('customers-tab');
    if(home&&clients){
      const homeActive=dashboard.dataset.view==='overview'&&!customer&&!approvals;
      home.classList.toggle('selected',homeActive);home.setAttribute('aria-pressed',String(homeActive));home.setAttribute('aria-current',homeActive?'page':'false');
      clients.classList.toggle('selected',customer);clients.setAttribute('aria-pressed',String(customer));clients.setAttribute('aria-current',customer?'page':'false');
    }
    syncRelated();
    more.classList.toggle('has-active-section',active);
    if(active)summary.setAttribute('aria-current','page');
    else summary.removeAttribute('aria-current');
  }
  syncMode();
  syncSelection();
  if(query.addEventListener)query.addEventListener('change',syncMode);
  else if(query.addListener)query.addListener(syncMode);
  const observer=new MutationObserver(syncSelection);
  observer.observe(dashboard,{attributes:true,attributeFilter:['data-view','data-home-section']});
  for(const button of more.querySelectorAll('button')){
    button.addEventListener('click',()=>{if(query.matches)more.open=false;});
  }
  document.addEventListener('pointerdown',event=>{
    if(query.matches&&more.open&&!more.contains(event.target))more.open=false;
  });
  document.addEventListener('keydown',event=>{
    if(query.matches&&more.open&&event.key==='Escape'){
      more.open=false;
      summary.focus();
      event.preventDefault();
    }
  });
}
