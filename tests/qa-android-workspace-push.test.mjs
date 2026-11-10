import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detectPushEnvironment,createPushController} from '../push-client.mjs';

function environment(userAgent){
 const calls=[];
 return {calls,isSecureContext:true,Intl,performance:{now:()=>1},setTimeout,clearTimeout,
  navigator:{userAgent,serviceWorker:{ready:Promise.resolve({pushManager:{
   getSubscription:async()=>{calls.push('subscription');return null;}
  }})}},matchMedia:()=>({matches:true}),
  Notification:{permission:'default',requestPermission:async()=>{calls.push('permission');return 'granted';}},
  PushManager:class{}};
}
test('Android APK uses native reminders even if Web Push objects exist',async()=>{
 const env=environment('Mozilla/5.0 Android LTSAndroid/15');
 const support=detectPushEnvironment(env);
 assert.equal(support.supported,false);assert.equal(support.installRequired,false);
 assert.match(support.message,/Promemoria Android/u);assert.doesNotMatch(support.message,/iPhone/u);
 const controller=createPushController({environment:env,apiRequest:async()=>{env.calls.push('API');return {};}});
 await controller.initialize();await controller.enable();await controller.test();await controller.disable();
 assert.deepEqual(env.calls,[]);assert.equal(controller.state.ready,false);controller.destroy();
});
test('Android WebView without Push APIs receives the same useful instruction',()=>{
 const env=environment('Mozilla/5.0 (Linux; Android 14; wv) LTSAndroid/15');
 delete env.Notification;delete env.PushManager;delete env.navigator.serviceWorker;
 assert.deepEqual(detectPushEnvironment(env),{
  supported:false,installRequired:false,
  message:'Nell’app Android gestisci i promemoria da ⋮ → Promemoria Android.'});
});
test('ordinary Android Chrome still uses available Web Push',()=>{
 assert.equal(detectPushEnvironment(environment('Mozilla/5.0 Android Chrome/140')).supported,true);
 assert.equal(detectPushEnvironment(environment('Mozilla/5.0 Android XLTSAndroid/15')).supported,true);
});
test('iPhone Home requirement and installed support remain unchanged',()=>{
 const env=environment('Mozilla/5.0 iPhone');env.matchMedia=()=>({matches:false});
 assert.equal(detectPushEnvironment(env).installRequired,true);
 env.navigator.standalone=true;assert.equal(detectPushEnvironment(env).supported,true);
});
test('APK hides reinstall prompts while normal browser install behavior remains',async()=>{
 const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
 const expression=source.match(/const isInstalled = \(\) => ([^\n]+);/u)?.[1];assert.ok(expression);
 const installed=new Function('standaloneMode','navigator',`return ${expression};`);
 assert.equal(installed({matches:false},{userAgent:'Mozilla Android LTSAndroid/15'}),true);
 assert.equal(installed({matches:false},{userAgent:'Mozilla Android Chrome/140'}),false);
 assert.equal(installed({matches:true},{userAgent:'Mozilla Android Chrome/140'}),true);
 assert.equal(installed({matches:false},{userAgent:'Mozilla iPhone',standalone:true}),true);
});
