/**
 * The documents page must go BACK to the existing register history entry,
 * not navigate to ../ and replay the initial truck loader. No auth shortcut:
 * directly opened Documents still falls back to the main app entry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.mjs');
const html=read('documenti/index.html');
const driver=read('documenti/driver-documents.mjs');

function navigationHarness(search,historyLength=2,previous='https://example.test/LTS-Registro-Viaggi/',supportsNavigation=true){
 const handlers=[];
 let backs=0;
 const links=Array.from({length:3},()=>({
  addEventListener(name,fn){assert.equal(name,'click');handlers.push(fn);}
 }));
 const document={querySelectorAll(selector){
  assert.equal(selector,'a[data-back-to-register]');
  return links;
 }};
 const window={location:{search,origin:'https://example.test'},history:{length:historyLength,back(){backs++;}},
  navigation:supportsNavigation?{currentEntry:{index:historyLength-1},entries:()=>[{index:historyLength-2,url:previous}]}:undefined};
 const first=driver.indexOf('const openedFromProfile=');
 const next=driver.indexOf("let category='cedolino'",first);
 assert.ok(first>=0&&next>first,'back-navigation handler must be initialized before document UI');
 const program=driver.slice(first,next);
 new Function('window','document','URLSearchParams',program)(window,document,URLSearchParams);
 return {
  count:handlers.length,
  click(index=0,overrides={}){
   let prevented=false;
   const event={defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,
    preventDefault(){prevented=true;},...overrides};
   handlers[index](event);
   return prevented;
  },
  get backs(){return backs;}
 };
}
test('profile entry is marked for same-tab history return',()=>{
 assert.match(app,/const target=new URL\('documenti\/',import\.meta\.url\)/);
 assert.match(app,/target\.searchParams\.set\('from','profile'\)/);
 assert.match(app,/window\.location\.assign\(target\.href\)/);
 assert.match(html,/<a href="\.\.\/" class="primary link-button" data-back-to-register>/);
 assert.equal((html.match(/data-back-to-register/g)||[]).length,3);
});
test('all return controls restore previous page without reloading the register',()=>{
 const h=navigationHarness('?from=profile',3);
 assert.equal(h.count,3);
 for(let i=0;i<3;i++)assert.equal(h.click(i),true);
 assert.equal(h.backs,3);
 assert.doesNotMatch(driver,/window\.location\.(assign|replace|reload)\(/);
});
test('directly opened Documents falls back to normal link instead of arbitrary history',()=>{
 const h=navigationHarness('',8);
 assert.equal(h.click(),false);
 assert.equal(h.backs,0);
});
test('fresh window with no previous entry keeps safe ../ fallback',()=>{
 const h=navigationHarness('?from=profile',1);
 assert.equal(h.click(),false);
 assert.equal(h.backs,0);
});
test('admin, foreign pages and unknown history never trigger blind back',()=>{
 for(const previous of ['https://example.test/LTS-Registro-Viaggi/amministratore/','https://example.test/LTS-Registro-Viaggi/status/','https://other.test/LTS-Registro-Viaggi/',null]){
  const h=navigationHarness('?from=profile',3,previous);
  assert.equal(h.click(),false);
  assert.equal(h.backs,0);
 }
 const old=navigationHarness('?from=profile',3,undefined,false);
 assert.equal(old.click(),false);
 assert.equal(old.backs,0);
});
test('modified click and already handled click preserve browser defaults',()=>{
 const cases=[{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{button:1},{defaultPrevented:true}];
 for(const special of cases){
  const h=navigationHarness('?from=profile',2);
  assert.equal(h.click(1,special),false);
  assert.equal(h.backs,0);
 }
});
test('PDF security, account checks and no-store stay unchanged',()=>{
 assert.match(driver,/const status=await account\.verifySession\(\)/);
 assert.match(driver,/await api\.acknowledge\(doc\.id\)/);
 assert.match(driver,/await api\.download\(doc\.id\)/);
 assert.match(driver,/function payrollConfigured\(\)/);
 assert.match(driver,/if\(!payrollConfigured\(\)\)showNotConfigured\(\)/);
 assert.match(html,/no-referrer/);
 assert.match(html,/default-src 'none'/);
});
