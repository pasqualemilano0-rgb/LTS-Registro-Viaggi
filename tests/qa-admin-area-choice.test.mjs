import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const login=source('amministratore/index.html');
const payroll=source('amministratore/buste-paga/index.html');
const chooser=source('amministratore/admin-area-choice.mjs');
const style=source('amministratore/admin-area-choice.css');

test('admin access first offers two exact areas while preserving original logistics login',()=>{
 assert.match(login,/id="admin-area-choice"/);
 assert.match(login,/id="select-area-logistica"/);
 assert.match(login,/>\s*AREA LOGISTICA\s*</);
 assert.match(login,/id="select-area-amministrativa"/);
 assert.match(login,/>\s*AREA AMMINISTRATIVA\s*</);
 assert.match(login,/id="admin-logistica-login" hidden/);
 assert.match(login,/id="login-form"/);
 assert.match(login,/id="mfa-panel"/);
 assert.match(login,/id="admin-area-back"/);
 const chooserStart=login.indexOf('id="admin-area-choice"');
 const formStart=login.indexOf('id="login-form"');
 const loginWrap=login.indexOf('id="admin-logistica-login"');
 assert.ok(chooserStart<loginWrap&&loginWrap<formStart);
 assert.ok(login.indexOf('id="admin-logistica-login" hidden')<formStart);
 assert.match(login,/src="\.\/admin-area-choice\.mjs\?v=20261118-v1"/);
 assert.match(login,/href="\.\/admin-area-choice\.css\?v=20261118-v1"/);
 assert.doesNotMatch(chooser,/account\.signOut|verifyAdminTotp|manageDrivers|localStorage|sessionStorage/);
});

test('area amministrativa points to independent login and preserves MFA requirements',()=>{
 assert.match(login,/id="select-area-amministrativa"[^>]*href="\.\/buste-paga\/"/);
 assert.match(payroll,/id="login-form"/);
 assert.match(payroll,/id="mfa-form"/);
 assert.match(payroll,/AREA AMMINISTRATIVA RISERVATA/);
 assert.match(payroll,/Accedi con l'account amministratore LTS/);
 assert.match(style,/#admin-area-choice\[hidden\],#admin-logistica-login\[hidden\]\{display:none!important\}/);
 assert.match(style,/@media\(max-width:560px\)/);
});

test('selection changes only presentation and allows returning without exposing password',()=>{
 const nodes=new Map();
 function element(id){
  const item={id,hidden:id==='admin-logistica-login',value:'',textContent:'',listeners:{},focused:false,
   addEventListener(type,fn){this.listeners[type]=fn;},
   focus(){this.focused=true;}
  };
  nodes.set(id,item);
  return item;
 }
 for(const id of [
  'admin-area-choice','admin-logistica-login','select-area-logistica',
  'admin-area-back','login-panel','login-phone','login-password','login-error','logout'
 ])element(id);
 const handlers={};
 runInNewContext(chooser,{
  document:{getElementById:id=>nodes.get(id)||null},
  window:{addEventListener(type,fn){handlers[type]=fn;}}
 });
 const button=nodes.get('select-area-logistica');
 button.listeners.click();
 assert.equal(nodes.get('admin-area-choice').hidden,true);
 assert.equal(nodes.get('admin-logistica-login').hidden,false);
 assert.equal(nodes.get('login-phone').focused,true);
 nodes.get('login-password').value='sensitive';
 nodes.get('admin-area-back').listeners.click();
 assert.equal(nodes.get('admin-area-choice').hidden,false);
 assert.equal(nodes.get('admin-logistica-login').hidden,true);
 assert.equal(nodes.get('login-password').value,'');
 assert.equal(nodes.get('select-area-logistica').focused,true);
 button.listeners.click();
 nodes.get('logout').listeners.click();
 assert.equal(nodes.get('admin-area-choice').hidden,false);
 assert.equal(nodes.get('admin-logistica-login').hidden,true);
 button.listeners.click();
 handlers.pageshow({persisted:true});
 assert.equal(nodes.get('admin-area-choice').hidden,false);
});
