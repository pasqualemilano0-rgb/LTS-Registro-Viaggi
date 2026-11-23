/**
 * LTS profile menu regrouping: no behavioral change to account, sync, backup,
 * login, payroll or archive actions. Presentation-only regression tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.mjs');
const css=read('app.css');
const begin=app.indexOf('function openProfile(required=false){');
const end=app.indexOf('function archiveSummary(',begin);
const profile=app.slice(begin,end);
const groups=[
 'Accesso rapido',
 'Dati e sincronizzazione',
 'Archivio e backup',
 'Account e sicurezza'
];
test('profile section order makes documents first and logout last',()=>{
 assert.ok(begin>=0&&end>begin);
 let last=-1;
 for(const name of groups){
  const i=profile.indexOf("'"+name+"'");
  assert.ok(i>last,'section missing or out of order: '+name);
  last=i;
 }
 assert.match(profile,/\['I MIEI DOCUMENTI','Gestisci autisti','Accedi con account autista'\]/);
 assert.match(profile,/\['Risolvi sincronizzazione','Sincronizza adesso','Collega dispositivi'\]/);
 assert.match(profile,/\['Esporta backup','Importa backup','Recupera archivio precedente','Esporta per Android','Ricarica dati online'\]/);
 assert.match(profile,/\['Installa app','Esci dall’account'\]/);
 assert.match(profile,/menu-button-featured/);
 assert.match(profile,/menu-button-logout/);
});

test('profile account and document authorization conditions are preserved',()=>{
 assert.match(profile,/if\(store\.usingAccount\(\)\&\&accountAccess\.getRole\(\)==='driver'\)\{/);
 assert.match(profile,/menuButton\('I MIEI DOCUMENTI'/);
 assert.match(profile,/if\(store\.usingAccount\(\)\&\&accountAccess\.getRole\(\)==='admin'\&\&accountAccess\.isVerified\(\)\)/);
 assert.match(profile,/if\(store\.usingAccount\(\)\)\{/);
 assert.match(profile,/store\.leaveAccountView\(\)/);
 assert.match(profile,/void accountAccess\.logout\(\)/);
 assert.match(profile,/syncConflictDialog\(\)/);
 assert.match(profile,/store\.syncPending\(\)/);
 assert.match(profile,/store\.loadState\(\{preferRemote:true\}\)/);
 assert.match(profile,/downloadBackup\(\)/);
 assert.match(profile,/importInput\.click\(\)/);
 assert.match(profile,/downloadAndroidBackup/);
 assert.match(profile,/showLegacyArchiveRecovery\(\)/);
 assert.match(profile,/deviceLinkDialog\(\)/);
 assert.match(profile,/appendPushSettings\(body/);
 assert.doesNotMatch(read('runtime-config.mjs'),/payrollEndpoint/);
});

test('menu buttons are MOVED without discarding handlers or hidden file input',()=>{
 assert.match(app,/function menuButton\(title,description,ico,handler\)\{return el\('button',\{type:'button',class:'menu-button','data-profile-action':title,on:\{click:handler\}\}/);
 assert.match(profile,/new Map\(\[\.\.\.oldProfileMenu\.querySelectorAll\('button\.menu-button'\)\]/);
 assert.match(profile,/oldProfileMenu\.replaceWith\(\.\.\.groups\)/);
 assert.match(profile,/if\(importField\)body\.append\(importField\)/);
 assert.match(profile,/if\(ungrouped\.length\)/);
 assert.match(profile,/if\(notifications\&\&accountGroup\)accountGroup\.before\(notifications\)/);
});

test('name edit is collapsible but onboarding stays mandatory',()=>{
 assert.match(profile,/if\(required\)body\.append\(form\)/);
 assert.match(profile,/else body\.append\(el\('details',\{class:'profile-edit-disclosure'\}/);
 assert.match(profile,/el\('summary',\{\},'Modifica nome e cognome'/);
 assert.match(profile,/if\(required\)first\.input\.focus\(\)/);
});

test('compact mobile styles and accessible grouped navigation are scoped',()=>{
 assert.match(css,/LTS profile menu 2026-11-23/);
 assert.match(css,/\.profile-action-group \.menu-button\{[^}]*min-height:57px/);
 assert.match(css,/\.profile-action-group \.menu-button-featured\{/);
 assert.match(css,/\.profile-action-group--security \.menu-button-logout\{/);
 assert.match(css,/\.profile-edit-disclosure>summary:focus-visible/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(profile,/el\('section',\{class:'profile-action-group profile-action-group--'\+kind,'aria-label':title\}/);
});

test('I MIEI DOCUMENTI uses PDF icon, backup icons remain download/upload, arrow is SVG',()=>{
 const docs=profile.indexOf("menuButton('I MIEI DOCUMENTI'");
 assert.ok(docs>=0,'Documents action remains in driver profile');
 assert.match(profile.slice(docs,docs+440),/'pdf',\(\)=>\{/);
 assert.match(app,/pdf:\['M14 2H6/);
 assert.match(app,/title==='I MIEI DOCUMENTI'\?icon\('chevron'\):'›'/);
 assert.match(app,/menuButton\('Esporta backup',[^\n]*'download'/);
 assert.match(app,/menuButton\('Importa backup',[^\n]*'upload'/);
 assert.match(css,/\.profile-action-group \.menu-button-featured \.menu-arrow>\.icon/);
});
