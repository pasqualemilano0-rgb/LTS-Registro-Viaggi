/* LTS admin: navigation presentation only; no auth, API or archive access. */
const dashboard=document.getElementById('dashboard');
const more=document.getElementById('admin-nav-more');
if(dashboard&&more){
  const query=window.matchMedia('(max-width: 1029px)');
  const summary=more.querySelector('summary');
  const extraViews=new Set(['alerts','exports','security']);
  function syncMode(){
    // The desktop sidebar must expose all seven existing navigation actions.
    more.open=!query.matches;
  }
  function syncSelection(){
    const active=extraViews.has(dashboard.dataset.view);
    more.classList.toggle('has-active-section',active);
    if(active)summary.setAttribute('aria-current','page');
    else summary.removeAttribute('aria-current');
  }
  syncMode();
  syncSelection();
  if(query.addEventListener)query.addEventListener('change',syncMode);
  else if(query.addListener)query.addListener(syncMode);
  const observer=new MutationObserver(syncSelection);
  observer.observe(dashboard,{attributes:true,attributeFilter:['data-view']});
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
