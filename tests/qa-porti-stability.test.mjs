import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
function fixture(){
 const timers=new Map();let seq=0,listener,reloads=0,renders=0;
 const origin='https://example.test';
 const account={verified:true,isVerified(){return this.verified}};
 const store={usingAccount:()=>true,getSyncInfo:()=>({})};
 const el=(tag,attrs={},...children)=>({tag,attrs,children,hidden:Boolean(attrs.hidden),isConnected:false,contentWindow:{messages:[],postMessage(m){this.messages.push(m)}},
  remove(){this.isConnected=false;},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},replaceChildren(...nodes){this.children=nodes},
  addEventListener(){}});
 const main={append(...nodes){for(const node of nodes)node.isConnected=true}};
 const start=app.indexOf('function clearPortiStartupTimer()');
 const stop=app.indexOf('function navigate(',start);
 const rstart=app.indexOf('function renderPorti(main)');
 const rstop=app.indexOf('function syncPortiSundayState()',rstart);
 const mstart=app.indexOf("window.addEventListener('message',event=>",rstop);
 const mstop=app.indexOf('function receiveState(',mstart);
 const ustart=app.indexOf('function safeAppUpdateReload()');
 const ustop=app.indexOf("navigator.serviceWorker?.addEventListener('controllerchange'",ustart);
 const code=app.slice(start,stop)+app.slice(rstart,rstop)+app.slice(mstart,mstop)+app.slice(ustart,ustop);
 const run=new Function('el','main','store','accountAccess','window','location','setTimeout','clearTimeout','onRender',
  "let tab='porti',portiFrame=null,portiStartupPanel=null,portiStartupTimer=null,portiLoadingTimer=null,portiLastSuspended=null;"+
  "let appWorkerChangePending=true,resumingVerification=false,busy=false,editingId=null;"+
  "const driverSessionShield={isVisible:()=>false,isQuiet:()=>false},root={querySelector:()=>null},document={hidden:false,querySelector:()=>null};"+
  "const runtimeConfig={basePath:'/LTS-Registro-Viaggi/'};const isPortiSundayInRome=()=>false;"+
  "const button=(label,style,click)=>({label,click});const navigate=next=>{tab=next;unmountPorti()};const render=()=>{onRender();renderPorti(main)};"+
  code+"\nreturn {renderPorti:()=>renderPorti(main),frame:()=>portiFrame,panel:()=>portiStartupPanel,unmountPorti,safeAppUpdateReload,setTab:v=>{tab=v}};");
 const h=run(el,main,store,account,{addEventListener:(name,fn)=>{listener=fn}},{origin,reload(){reloads++}},
  (fn,ms)=>{timers.set(++seq,{fn,ms});return seq},id=>timers.delete(id),()=>renders++);
 h.renderPorti();
 return {...h,timers,account,message(type,source=h.frame()?.contentWindow,from=origin){listener({data:{type},origin:from,source})},
  reloads:()=>reloads,renders:()=>renders};
}
test('full startup deadline survives handshake and removes hung iframe',()=>{
 const h=fixture(),frame=h.frame();
 assert.equal(h.panel().attrs['aria-busy'],'true');
 h.message('lts-porti-ready');
 assert.deepEqual(frame.contentWindow.messages,[{type:'lts-porti-authorized'}]);
 const timer=[...h.timers.values()].find(t=>t.ms===20000);
 assert.equal(timer.ms,20000);
 timer.fn();
 assert.equal(h.frame(),null);assert.equal(frame.isConnected,false);
 assert.equal(h.panel().attrs['aria-busy'],'false');
 assert.equal(h.panel().hidden,false);
 assert.equal(h.panel().attrs['data-state'],'error');
 assert.equal(h.timers.size,0);
 assert.equal(h.panel().children[2].label,'Riprova');
 h.panel().children[2].click();
 assert.notEqual(h.frame(),frame);assert.equal(h.renders(),1);
 h.message('lts-porti-rendered',frame.contentWindow);
 assert.ok(h.panel(),'late old-frame message ignored');
});
test('only current same-origin verified iframe can complete startup',()=>{
 const h=fixture(),frame=h.frame();
 h.message('lts-porti-rendered',{});h.message('lts-porti-rendered',frame.contentWindow,'https://other.test');
 assert.ok(h.panel());
 h.account.verified=false;h.message('lts-porti-ready');h.message('lts-porti-rendered');
 assert.ok(h.panel());assert.equal(frame.contentWindow.messages.length,0);
 h.account.verified=true;h.message('lts-porti-ready');h.message('lts-porti-rendered');
 assert.equal(h.panel(),null);assert.equal(h.timers.size,0);
 assert.equal(h.frame(),frame);
 assert.equal(Object.hasOwn(frame.attrs,'data-porti-starting'),false);
});
test('leaving Porti cancels deadline and ignores old messages',()=>{
 const h=fixture(),frame=h.frame();h.unmountPorti();h.setTab('register');
 h.message('lts-porti-failed',frame.contentWindow);
 assert.equal(h.timers.size,0);assert.equal(h.panel(),null);assert.equal(h.frame(),null);
});
test('fast startup never displays the loader or waits for its timer',()=>{
 const h=fixture(),frame=h.frame();
 assert.equal(h.panel().hidden,true);
 assert.equal(frame.attrs['data-porti-starting'],true);
 const delayed=[...h.timers.values()].find(t=>t.ms===300);
 assert.ok(delayed);
 h.message('lts-porti-ready');h.message('lts-porti-rendered');
 assert.equal(h.panel(),null);assert.equal(h.timers.size,0);
 delayed.fn();
 assert.equal(h.panel(),null);
 assert.equal(Object.hasOwn(frame.attrs,'data-porti-starting'),false);
});
test('slow startup shows feedback after 300ms, then reveals the same iframe',()=>{
 const h=fixture(),frame=h.frame();
 assert.equal(h.panel().hidden,true);
 const [id,delayed]=[...h.timers.entries()].find(([,t])=>t.ms===300);
 h.timers.delete(id);delayed.fn();
 assert.equal(h.panel().hidden,false);
 assert.equal(frame.attrs['data-porti-starting'],true);
 h.message('lts-porti-ready');h.message('lts-porti-rendered');
 assert.equal(h.panel(),null);assert.equal(h.frame(),frame);
 assert.equal(Object.hasOwn(frame.attrs,'data-porti-starting'),false);
 assert.equal(h.timers.size,0);
});
test('early startup failure shows error immediately and cancels the delayed indicator',()=>{
 const h=fixture();const delayed=[...h.timers.values()].find(t=>t.ms===300);
 h.message('lts-porti-failed');
 assert.equal(h.panel().hidden,false);assert.equal(h.panel().attrs['data-state'],'error');
 assert.equal(h.timers.size,0);delayed.fn();
 assert.equal(h.panel().attrs['data-state'],'error');
});
test('PWA update cannot reload during Porti consultation',()=>{
 const h=fixture();assert.equal(h.safeAppUpdateReload(),false);assert.equal(h.reloads(),0);
 h.setTab('register');assert.equal(h.safeAppUpdateReload(),true);assert.equal(h.reloads(),1);
});
