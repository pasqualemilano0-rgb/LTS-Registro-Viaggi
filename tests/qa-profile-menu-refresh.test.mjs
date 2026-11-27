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
 assert.match(profile,/\['I MIEI DOCUMENTI','Accedi con account autista'\]/);
 assert.match(profile,/\['Risolvi sincronizzazione','Sincronizza adesso','Collega dispositivi'\]/);
 assert.match(profile,/\['Esporta backup','Importa backup','Recupera archivio precedente','Esporta per Android','Ricarica dati online'\]/);
 assert.match(profile,/\['Installa app','Esci dall’account'\]/);
 assert.doesNotMatch(profile,/menu-button-featured/);
 assert.match(profile,/menuButton\('I MIEI DOCUMENTI'/);
 assert.match(profile,/menu-button-logout/);
});

test('profile account and document authorization conditions are preserved',()=>{
 assert.match(profile,/if\(payrollProfileEligible\(\)\)\{/);
 assert.match(profile,/menuButton\('I MIEI DOCUMENTI'/);
 assert.doesNotMatch(profile,/menuButton\('Gestisci autisti'/);
 assert.doesNotMatch(profile,/location\.assign\(new URL\('amministratore\//);
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
 assert.doesNotMatch(profile,/appendPushSettings\(body|push-settings|reminder/i);
 assert.doesNotMatch(app,/import \{ appendPushSettings \}/);
 assert.match(read('runtime-config.mjs'),/payrollEndpoint/);
 assert.match(app,/await api\.documents\(\{offset:0\}\)/);
 assert.match(profile,/if\(payrollProfileCached\(accountOwner\)\)showAuthorizedDocuments\(true\)/);
 assert.match(profile,/accountAccess\.getAccountId\(\)!==accountOwner/);
});

test('menu buttons are MOVED without discarding handlers or hidden file input',()=>{
 assert.match(app,/function menuButton\(title,description,ico,handler\)\{return el\('button',\{type:'button',class:'menu-button','data-profile-action':title,on:\{click:handler\}\}/);
 assert.match(profile,/new Map\(\[\.\.\.oldProfileMenu\.querySelectorAll\('button\.menu-button'\)\]/);
 assert.match(profile,/oldProfileMenu\.replaceWith\(\.\.\.groups\)/);
 assert.match(profile,/if\(importField\)body\.append\(importField\)/);
 assert.match(profile,/if\(ungrouped\.length\)/);
 assert.doesNotMatch(profile,/const notifications=body\.querySelector\('\.push-settings'\)/);
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
 assert.doesNotMatch(css,/\.profile-action-group \.menu-button-featured\{/);
 assert.match(css,/\.profile-action-group \.profile-menu-rows\{gap:0;border:1px solid #dde9ee;border-radius:15px;background:#fff/);
 assert.doesNotMatch(css,/\.profile-action-group--services \.profile-menu-rows\{/);
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
 assert.match(css,/\[data-profile-action="I MIEI DOCUMENTI"\] \.menu-arrow>\.icon/);
});

test('profile removes Promemoria section without disabling push support elsewhere',()=>{
 assert.doesNotMatch(profile,/appendPushSettings|push-settings|Promemoria/i);
 assert.doesNotMatch(profile,/notifications\&\&accountGroup/);
 const pushClient=read('push-client.mjs');
 assert.match(pushClient,/export function appendPushSettings\(/);
 assert.match(pushClient,/createPushController/);
 assert.match(profile,/addProfileGroup\('Account e sicurezza'/);
});

test('document and backup rows have equal neutral background and icon semantics',()=>{
 const group=css.match(/\.profile-action-group \.profile-menu-rows\{([^}]*)\}/);
 assert.ok(group&&group[1].includes('background:#fff'),'All profile groups use a white list');
 assert.doesNotMatch(css,/\.profile-action-group--services \.profile-menu-rows\{/);
 assert.doesNotMatch(css,/\.menu-button-featured/);
 assert.match(app,/menuButton\('I MIEI DOCUMENTI',[\s\S]*?'pdf',\(\)=>\{/);
 assert.match(css,/\.profile-action-group \.menu-button>\.icon\{width:21px;height:21px;color:#13788e\}/);
 assert.match(app,/menuButton\('Esporta backup',[^\n]*'download'/);
 assert.match(app,/menuButton\('Importa backup',[^\n]*'upload'/);
});
