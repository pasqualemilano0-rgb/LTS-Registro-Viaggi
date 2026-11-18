import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const login=source('amministratore/index.html');
const payroll=source('amministratore/buste-paga/index.html');
const chooser=source('amministratore/admin-area-choice.mjs');
const style=source('amministratore/admin-area-choice.css');

test('admin access first offers two exact areas while preserving original logistics login',()=>{
 assert.match(login,/id="admin-area-choice"/);
 assert.match(login,/id="select-area-logistica"/);
 assert.match(login,/>AREA(?:<br>|\s+)LOGISTICA<\/span>/);
 assert.match(login,/id="select-area-amministrativa"/);
 assert.match(login,/>AREA(?:<br>|\s+)AMMINISTRATIVA<\/span>/);
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
 assert.match(style,/@media\(max-width:480px\)/);
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


test('approved branding uses the exact original logo, Napoli porto and camion local assets',()=>{
 const raw=readFileSync(new URL('../assets/lts-logo.png',import.meta.url));
 const gitBlobSha=createHash('sha1').update(Buffer.from('blob '+raw.byteLength+'\0')).update(raw).digest('hex');
 assert.equal(gitBlobSha,'168228cfb22738ed74a3115fc47d361b635f9308',
   'Do not replace the user-supplied original LTS red/cyan logo.');
 assert.match(login,/src="\.\.\/assets\/lts-logo\.png"/);
 assert.match(login,/src="\.\.\/assets\/admin-hero-napoli\.svg"/);
 assert.match(login,/src="\.\.\/assets\/admin-card-logistica\.svg"/);
 assert.match(login,/src="\.\.\/assets\/admin-card-amministrativa\.(?:webp|svg)"/);
 const hero=source('assets/admin-hero-napoli.svg');
 assert.match(hero,/PORTO DI NAPOLI/);
 assert.match(hero,/Vesuvio|Napoli/);
 assert.match(hero,/truck|Camion|camion/);
 assert.match(style,/--lts-red:#ef082f/);
 assert.match(style,/--lts-cyan:#00a9e7/);
 assert.match(style,/--lts-navy:#062b59/);
 assert.match(style,/@media\(max-width:480px\)/);
});


test('visual selector never affects authenticated logistics dashboard or MFA',()=>{
 assert.match(style,/body:has\(#login-panel:not\(\[hidden\]\) #admin-area-choice:not\(\[hidden\]\)\) \.topbar/);
 assert.doesNotMatch(style,/body:has\(#admin-area-choice:not\(\[hidden\]\)\)/);
 assert.match(login,/id="dashboard" hidden/);
 assert.match(login,/id="mfa-panel"/);
 assert.match(style,/#admin-area-choice\[hidden\]/);
});
