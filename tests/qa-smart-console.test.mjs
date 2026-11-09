import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchSmartConsole,smartConsoleAlerts,smartCommandIntent} from '../amministratore/smart-console-model.mjs';
import {filterDrivers,driverInitial} from '../amministratore/model.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const drivers=[
 {firstName:'Mario',lastName:'Rossi',phone:'+393331111111',status:'active'},
 {firstName:'Lucia',lastName:'Bianchi',phone:'+393332222222',status:'pending'}
];
const customers=[
 {name:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA',address:'VIA TEST'},
 {name:'ACETIFICIO ANDREA MILANO SRL',city:'SAN GIOVANNI A TEDUCCIO',address:'VIA DUE GIUGNO'},
 {name:'FRATELLI ROSSI SRL',city:'FERENTINO',address:'ZONA INDUSTRIALE'}
];
const trips=[
 {container:'MSDU1234567',client:'ACETIFICIO ANDREA MILANO SRL',city:'ACERRA',driverName:'Mario Rossi',date:'2026-11-08'},
 {container:'ABCD1234567',client:'FRATELLI ROSSI SRL',city:'FERENTINO',driverName:'Lucia Bianchi',date:'2026-11-06'}
];
test('one search finds driver by name or phone, client by city and trip by container',()=>{
 const d=searchSmartConsole({query:'MAR',drivers,customers,trips});
 assert.equal(d.drivers.length,1);
 assert.equal(d.drivers[0].row.firstName,'Mario');
 assert.equal(searchSmartConsole({query:'333222222',drivers}).drivers.length,1);
 assert.equal(searchSmartConsole({query:'FERENTINO',customers}).customers.length,1);
 assert.equal(searchSmartConsole({query:'MSDU',trips}).trips[0].row.container,'MSDU1234567');
});
test('customer sites remain separate, accents ignored, and exact name precedes word match',()=>{
 const got=searchSmartConsole({query:'ACETIFICIO',customers});
 assert.equal(got.customers.length,2);
 assert.notEqual(got.customers[0].row.city,got.customers[1].row.city);
 assert.equal(searchSmartConsole({query:'MILANO',customers}).customers.length,2);
 assert.deepEqual(searchSmartConsole({query:'NOME INVENTATO',customers}).customers,[]);
});
test('search never invents matches and strictly limits visible results',()=>{
 const d=searchSmartConsole({query:'ROSSI',drivers,customers,trips,limit:1});
 assert.equal(d.drivers.length,1);
 assert.equal(d.customers.length,1);
 assert.equal(d.trips.length,1);
 assert.deepEqual(searchSmartConsole({query:'',drivers,customers,trips}),{drivers:[],customers:[],trips:[]});
});
test('action priorities are grounded exclusively in loaded counts',()=>{
 const none=smartConsoleAlerts({drivers:[],report:null,customerStats:null});
 assert.deepEqual(none,[]);
 const alerts=smartConsoleAlerts({
  drivers,report:{summary:{missingTariffCount:2},incompleteArchives:1},
  customerStats:{unpriced:3}
 });
 assert.deepEqual(alerts.map(x=>x.kind),['pending','missing','incomplete','unpriced']);
 assert.deepEqual(alerts.map(x=>x.count),[1,2,1,3]);
 assert.deepEqual(smartConsoleAlerts({report:{summary:{missingTariffCount:null}}}),[]);
});
test('smart panel only uses existing authorized app state and original guarded forms',()=>{
 const html=read('amministratore/index.html'),admin=read('amministratore/admin.mjs'),
  report=read('amministratore/report.mjs'),smart=read('amministratore/smart-console.mjs');
 assert.match(html,/id="smart-command-open"[^>]*hidden/);
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(html,/data-smart-action="invite"/);
 assert.match(html,/data-smart-action="restore"/);
 assert.match(admin,/account[.]isVerified\(\)&&account[.]getRole\(\)==='admin'/);
 assert.match(admin,/smartConsole[.]reset\(\)/);
 assert.match(report,/peekCustomers\(\)\{return companyDirectory[.]peek\(\);/);
 assert.match(smart,/moveExisting\(section\)/);
 assert.match(smart,/moveExisting\(byId\('secret-panel'\)\)/);
 assert.match(smart,/clearPrivateCode\(\)/);
 assert.match(smart,/byId\('dashboard'\)[.]inert=true/);
 assert.doesNotMatch(smart,/localStorage|indexedDB|sessionStorage|fetch\(|innerHTML|service[_-]?role/i);
 assert.doesNotMatch(read('amministratore/smart-console-model.mjs'),/localStorage|fetch\(|innerHTML/i);
});

test('Italian task phrases suggest safe actions without changing records',()=>{
 assert.equal(smartCommandIntent('invita un autista')?.action,'invite');
 assert.equal(smartCommandIntent('reinserisci autista')?.action,'restore');
 assert.equal(smartCommandIntent('aggiungi cliente')?.action,'manual');
 assert.equal(smartCommandIntent('esporta report')?.action,'exports');
 assert.equal(smartCommandIntent('cerca le tariffe')?.action,'rates');
 assert.equal(smartCommandIntent('mostra le anomalie')?.action,'alerts');
 assert.equal(smartCommandIntent('cerca viaggi')?.action,'trips');
 assert.equal(smartCommandIntent('Mario Rossi'),null);
 assert.equal(smartCommandIntent(''),null);
});

test('driver roster sorts by Italian surname, ignores accents and filters alphabetically without modifying source',()=>{
 const data=[
  {firstName:'Maria',lastName:'Zorzi',phone:'3',status:'active'},
  {firstName:'Anna',lastName:'Èsposito',phone:'1',status:'active'},
  {firstName:'Paolo',lastName:'Bianchi',phone:'2',status:'disabled'},
  {firstName:'Luca',lastName:'Esposito',phone:'4',status:'active'}
 ];
 assert.equal(driverInitial(data[1]),'E');
 assert.deepEqual(filterDrivers(data).map(x=>x.phone),['2','1','4','3']);
 assert.deepEqual(filterDrivers(data,'èspos','all','E').map(x=>x.phone),['1','4']);
 assert.deepEqual(filterDrivers(data,'Esposito Anna').map(x=>x.phone),['1']);
 assert.deepEqual(filterDrivers(data,'','blocked').map(x=>x.phone),['2']);
 assert.deepEqual(data.map(x=>x.phone),['3','1','2','4'],'original roster is immutable');
 const html=read('amministratore/index.html');
 assert.match(html,/id="roster-letters"/);
 assert.match(html,/id="roster-count"/);
});
