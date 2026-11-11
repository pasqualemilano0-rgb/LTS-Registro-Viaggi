import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_ACTIONS,normalizeActionPreferences,deriveControlCenter,buildTrendDays,
 searchAuthorized,hasCompleteInsightRecords,romeDate,isCalendarDay}
 from '../amministratore/control-center-model.mjs';

const today='2026-11-11';
const driverA='11111111-1111-4111-8111-111111111111';
const driverB='22222222-2222-4222-8222-222222222222';
const trip=(id,driverId,date,amountCents,other={})=>({id,driverId,date,amountCents,
 driverName:driverId===driverA?'MARCO ROSSI':'MARCO ROSSI',container:'MSDU345676.8',
 client:'CLIENTE ALFA',city:'NAPOLI',fareCents:amountCents,secondClient:'',secondCity:'',
 updatedAt:date+'T12:00:00Z',...other});
function insights(records=[],overrides={}){
 const daily=new Map();
 for(const t of records){const r=daily.get(t.date)||{date:t.date,trips:0,totalCents:0};r.trips++;r.totalCents+=t.amountCents;daily.set(t.date,r);}
 return {month:'2026-11',range:{fromDate:'2026-10-13',toDate:today},
  summary:{trips:records.length,totalCents:records.reduce((s,t)=>s+t.amountCents,0)},
  records,daily:[...daily.values()],monthly:[],alerts:[],alertTotal:0,
  incompleteArchives:0,partial:false,options:{clients:[],cities:[]},...overrides};
}
function monthly(overrides={}){
 return {month:'2026-11',summary:{trips:2,knownTotalCents:3000,missingTariffCount:0},
  chart:[{date:'2026-11-10',count:1,totalCents:1000},{date:today,count:1,totalCents:2000}],
  trips:[],drivers:[],incompleteArchives:0,...overrides};
}
function freeze(value){
 if(value&&typeof value==='object'){Object.freeze(value);for(const entry of Object.values(value))freeze(entry);}
 return value;
}

test('unknown sources do not become invented zeroes or activities',()=>{
 const result=deriveControlCenter({today});
 assert.deepEqual(Object.values(result.kpis),Array(8).fill(null));
 assert.deepEqual(result.operations,{approvals:[],alerts:[],syncAlerts:[],updates:[]});
 assert.equal(result.scope.tripSearch,'unavailable');
 assert.equal(result.charts.daily.days.length,30);
 assert(result.charts.daily.days.every(day=>day.count===null&&!day.known));
});

test('confirmed empty datasets produce real zeroes, including today and month cents',()=>{
 const result=deriveControlCenter({today,roster:[],customerStats:{customers:[]},approvals:[],
  report:monthly({summary:{trips:0,knownTotalCents:0,missingTariffCount:0},chart:[]}),insights:insights()});
 assert.deepEqual(Object.values(result.kpis),Array(8).fill(0));
 assert.equal(result.scope.recordsComplete,true);
 assert.equal(result.charts.daily.complete,true);
 assert(result.charts.daily.days.every(day=>day.count===0&&day.totalCents===0&&day.known));
});

test('KPI values use their authoritative source and count sites rather than guessed companies',()=>{
 const result=deriveControlCenter({today,roster:[{status:'active'},{status:'disabled'},{status:'invited'}],
  report:monthly(),customerStats:{customers:[{id:'a',name:'ALFA',city:'NAPOLI'},{id:'b',name:'ALFA',city:'ROMA'}]},
  insights:insights([],{alertTotal:8,alerts:[{type:'archive',detail:'3 archivi non leggibili'}],incompleteArchives:3}),
  approvals:[{id:'p1'}]});
 assert.deepEqual(result.kpis,{driversTotal:3,driversActive:1,tripsToday:1,tripsMonth:2,
  faresMonthCents:3000,companyCustomers:2,anomalies:8,pendingApprovals:1});
 assert.equal(result.scope.customerUnit,'Sedi registrate');
 assert.match(result.scope.monthlyValue,/non fatturato/u);
 assert.equal(result.scope.alertsTruncated,true);
 assert.equal(result.incompleteArchives,0,'Monthly source keeps its own explicit coverage');
});

test('today is unknown outside the selected month and when aggregate coverage is inconsistent',()=>{
 assert.equal(deriveControlCenter({today,report:monthly({month:'2026-10'})}).kpis.tripsToday,null);
 assert.equal(deriveControlCenter({today,report:monthly({chart:[]})}).kpis.tripsToday,null);
 assert.equal(deriveControlCenter({today,report:monthly({chart:[{date:today,count:1},{date:today,count:1}]})}).kpis.tripsToday,null);
 assert.equal(deriveControlCenter({today,report:monthly({chart:[{date:'2026-12-01',count:2}]})}).kpis.tripsToday,null);
 const malformed=deriveControlCenter({today,report:{summary:{trips:2,knownTotalCents:3000}}});
 assert.equal(malformed.kpis.tripsMonth,null);assert.equal(malformed.kpis.faresMonthCents,null);
});

test('partial month does not turn fares into invoiced revenue or sum overlapping anomalies',()=>{
 const result=deriveControlCenter({today,report:monthly({summary:{trips:2,knownTotalCents:2000,missingTariffCount:1},incompleteArchives:2})});
 assert.equal(result.partial,true);assert.equal(result.kpis.faresMonthCents,2000);
 assert.equal(result.kpis.anomalies,null);assert.equal(result.missingTariffCount,1);
 assert.equal(result.incompleteArchives,2);
});

test('monthly fare completeness does not inherit a missing tariff outside that month',()=>{
 const data=insights([trip('october-missing',driverA,'2026-10-20',0,{missingTariff:true}),
  trip('november-complete',driverA,today,2000)],{partial:true,summary:{trips:2,totalCents:2000,missingTariffCount:1}});
 const result=deriveControlCenter({today,report:monthly(),insights:data});
 assert.equal(result.partial,true,'The selected 30-day analysis is genuinely partial');
 assert.equal(result.monthPartial,false,'November is complete even though October has a missing price');
 assert.equal(result.kpis.faresMonthCents,3000,'The month KPI remains the authoritative monthly total');
 const reverse=deriveControlCenter({today,insights:insights([trip('complete-day',driverA,today,2000)]),
  report:monthly({summary:{trips:2,knownTotalCents:2000,missingTariffCount:1}})});
 assert.equal(reverse.monthPartial,true,'A complete day selection must not clear a monthly missing tariff');
 assert.equal(reverse.partial,true);
 assert.equal(deriveControlCenter({today}).monthPartial,null,'An unavailable month has no invented completeness');
});

test('100 loaded approvals are capped explicitly rather than claimed as the company-wide total',()=>{
 const result=deriveControlCenter({today,approvals:Array.from({length:100},(_,id)=>({id:String(id)}))});
 assert.equal(result.kpis.pendingApprovals,100);assert.equal(result.scope.pendingApprovalsCapped,true);
 assert.equal(result.operations.approvals.length,5);
 assert.equal(deriveControlCenter({today,approvals:[]}).scope.pendingApprovalsCapped,false);
});

test('30-day trend crosses months and Rome DST without inventing dates outside API range',()=>{
 const data=insights([trip('oct',driverA,'2026-10-25',2500),trip('nov',driverA,today,0)]);
 const result=buildTrendDays(data,{today});
 assert.equal(result.fromDate,'2026-10-13');assert.equal(result.toDate,today);
 assert.equal(result.days.length,30);assert.equal(result.complete,true);
 assert.equal(result.days.find(x=>x.date==='2026-10-25').count,1);
 assert.equal(result.days.find(x=>x.date===today).totalCents,0);
 const clipped=buildTrendDays({...data,range:{fromDate:'2026-11-01',toDate:today},records:[data.records[1]],summary:{trips:1},daily:[{date:today,trips:1}]},{today});
 assert.equal(clipped.complete,false);
 assert.equal(clipped.days.find(x=>x.date==='2026-10-31').count,null);
 assert.equal(clipped.days.find(x=>x.date==='2026-11-01').count,0);
});

test('bad or incomplete insight records cannot become complete search or aggregated charts',()=>{
 const a=trip('a',driverA,today,1000);
 const cases=[insights([a],{summary:{trips:200}}),insights([a,a]),
  insights([{...a,amountCents:-1}]),insights([{...a,date:'2026-02-31'}]),
  insights([{...a,date:'2026-10-01'}]),insights([{...a,driverId:''}])];
 for(const sample of cases){
  assert.equal(hasCompleteInsightRecords(sample),false);
  const model=deriveControlCenter({today,insights:sample});
  assert.equal(model.scope.recordsComplete,false);assert.deepEqual(model.charts.drivers,[]);
 }
});

test('driver UUID identities stay separate even when displayed names are identical',()=>{
 const data=insights([trip('a',driverA,today,1000),trip('a',driverB,today,2000)]);
 const model=deriveControlCenter({today,insights:data,roster:[{phone:'+393331111111',firstName:'MARCO',lastName:'ROSSI',status:'active'}]});
 assert.equal(model.charts.drivers.length,2);
 assert.deepEqual(new Set(model.charts.drivers.map(x=>x.id)),new Set([driverA,driverB]));
 assert.equal(model.charts.drivers.reduce((s,x)=>s+x.totalCents,0),3000);
 assert(model.charts.drivers.every(row=>!Object.hasOwn(row,'phone')));
});

test('range aggregation preserves zero and rejects cent overflow without rounding',()=>{
 const data=insights([trip('a',driverA,today,Number.MAX_SAFE_INTEGER),trip('b',driverA,today,1)]);
 const model=deriveControlCenter({today,insights:data});
 assert.equal(model.charts.clients[0].totalCents,null);
 assert.equal(model.charts.drivers[0].totalCents,null);
 assert.equal(model.charts.daily.days.at(-1).totalCents,null);
 const zero=deriveControlCenter({today,insights:insights([trip('z',driverA,today,0)])});
 assert.equal(zero.charts.clients[0].totalCents,0);
});

test('monthly history advertises its different filter scope and remains independent of range rows',()=>{
 const data=insights([trip('a',driverA,today,1000)],{selection:{driverId:driverA,client:'ALFA',city:'NAPOLI'},
  monthly:[{month:'2026-10',trips:8,totalCents:4000},{month:'2026-11',trips:10,totalCents:6000}]});
 const model=deriveControlCenter({today,insights:data});
 assert.equal(model.charts.clients[0].count,1);
 assert.equal(model.charts.monthly[1].trips,10);
 assert.equal(model.scope.monthly,'whole-months-driver-only');
 assert.equal(model.scope.selection.client,'ALFA');
});

test('search only searches confirmed loaded records and exposes its page scope',()=>{
 const a=trip('a',driverA,today,1000,{client:'SOCIETÀ ÈLITE',city:'CITTÀ DI CASTELLO'});
 const data=insights([a]);
 const all=searchAuthorized({query:'societa elite',insights:data});
 assert.equal(all.scope,'complete-period');assert.equal(all.trips.length,1);assert.equal(all.trips[0].row,a);
 const partial=searchAuthorized({query:'MSDU',report:monthly({trips:[a],pagination:{total:200}})});
 assert.equal(partial.scope,'loaded-page');assert.equal(partial.trips.length,1);
 const unknown=searchAuthorized({query:'MSDU',insights:{records:[a]}});
 assert.equal(unknown.scope,'unavailable');assert.equal(unknown.trips.length,0);
 const city=searchAuthorized({query:'citta',insights:data});
 assert.deepEqual(city.localities[0].row,{city:'CITTÀ DI CASTELLO'});
});

test('search keeps unsafe input as inert text and never interprets it as markup',()=>{
 const literal='<img src=x onerror=alert(1)>';
 const result=searchAuthorized({query:'img',customers:[{name:literal,city:'ROMA'}]});
 assert.equal(result.customers[0].label,literal);
 assert.equal(result.customers[0].kind,'customer');
});

test('both pickups are searchable and supply client and locality filter options',()=>{
 const row=trip('two',driverA,today,5000,{secondClient:'CLIENTE BÈTA',secondCity:'CITTÀ DI CASTELLO',
  fareCents:1000,secondFareCents:2000,sumPickupFares:true});
 const data=insights([row]);
 assert.equal(searchAuthorized({query:'cliente beta',insights:data}).trips[0].row,row);
 const citySearch=searchAuthorized({query:'citta',insights:data});
 assert.equal(citySearch.trips.length,1);
 assert.deepEqual(citySearch.localities.map(item=>item.label),['CITTÀ DI CASTELLO']);
 assert.equal(searchAuthorized({query:'cliente beta',report:monthly({trips:[row]})}).scope,'loaded-page');
 assert.equal(searchAuthorized({query:'cliente beta',report:monthly({trips:[row]})}).trips.length,1);
 const model=deriveControlCenter({today,insights:data});
 assert(model.options.clients.includes('CLIENTE BÈTA'));
 assert(model.options.cities.includes('CITTÀ DI CASTELLO'));
 assert.equal(model.scope.pickups,'both-pickups-distinct-trips');
 assert.equal(model.scope.secondPickupsComplete,true);
});

test('pickup charts count each involved client and city once per journey and exclude extras from fare attribution',()=>{
 const row=trip('reefer',driverA,today,7500,{client:'ALFA',city:'NAPOLI',
  secondClient:'BETA',secondCity:'ROMA',fareCents:1000,secondFareCents:2000,
  sumPickupFares:true,services:['reefer'],extraCents:{reefer:4500}});
 const repeated=trip('same',driverA,today,3000,{client:'ALFA',city:'NAPOLI',
  secondClient:'ALFA',secondCity:'NAPOLI',fareCents:1500,secondFareCents:1500,sumPickupFares:true});
 const data=freeze(insights([row,repeated])),before=JSON.stringify(data);
 const model=deriveControlCenter({today,insights:data});
 const alfa=model.charts.clients.find(item=>item.id==='ALFA'),beta=model.charts.clients.find(item=>item.id==='BETA');
 assert.deepEqual({count:alfa.count,pickupCount:alfa.pickupCount,totalCents:alfa.totalCents,partial:alfa.amountPartial},
  {count:2,pickupCount:3,totalCents:4000,partial:false});
 assert.deepEqual({count:beta.count,totalCents:beta.totalCents},{count:1,totalCents:2000});
 assert.equal(model.charts.cities.find(item=>item.id==='NAPOLI').count,2);
 assert.equal(model.charts.clients.reduce((sum,item)=>sum+item.totalCents,0),6000);
 assert.equal(model.charts.drivers[0].totalCents,10500,'Driver totals keep the real journey extras');
 assert.equal(model.scope.clientAmounts,'historical-pickup-fares-excluding-extras');
 assert.equal(model.scope.clientAmountsComplete,true);
 assert.equal(JSON.stringify(data),before,'Historical fare and REEFER snapshots stay immutable');
});

test('legacy or non-summed second pickup amounts stay unknown instead of receiving journey extras',()=>{
 const legacy=trip('legacy',driverA,today,1500,{fareCents:undefined,secondClient:undefined,secondCity:undefined});
 const first=deriveControlCenter({today,insights:insights([legacy])});
 assert.equal(first.charts.clients[0].totalCents,null);assert.equal(first.charts.clients[0].amountPartial,true);
 assert.equal(first.scope.clientAmountsComplete,false);assert.equal(first.scope.secondPickupsComplete,false);
 for(const sumPickupFares of [false,undefined]){
  const row=trip('two',driverA,today,4500,{client:'ALFA',fareCents:1000,
   secondClient:'BETA',secondCity:'ROMA',secondFareCents:2000,sumPickupFares});
  const model=deriveControlCenter({today,insights:insights([row])});
  assert.equal(model.charts.clients.find(item=>item.id==='ALFA').totalCents,1000);
  const second=model.charts.clients.find(item=>item.id==='BETA');
  assert.equal(second.count,1);assert.equal(second.totalCents,null);assert.equal(second.amountPartial,true);
  assert.equal(model.scope.clientAmountsComplete,false);
 }
});

test('quick preferences are complete, unique, valid and retain at least one visible action',()=>{
 assert.equal(ADMIN_ACTIONS.length,10);assert(Object.isFrozen(ADMIN_ACTIONS));
 const ids=ADMIN_ACTIONS.map(x=>x.id);
 const value=normalizeActionPreferences({order:['exports','exports','__proto__','drivers'],hidden:[...ids,'not-real']});
 assert.equal(value.order.length,10);assert.equal(value.order[0],'exports');
 assert.equal(new Set(value.order).size,10);assert(!value.hidden.includes('exports'));
 assert.equal(value.hidden.length,9);assert(!value.order.includes('__proto__'));
 assert.deepEqual(normalizeActionPreferences(null),{order:ids,hidden:[]});
});

test('selectors never mutate the API snapshots, preferences, records or arrays',()=>{
 const input=freeze({today,roster:[{status:'active'}],report:monthly(),
  insights:insights([trip('a',driverA,today,1000)]),customerStats:{customers:[{name:'ALFA',city:'ROMA'}]},approvals:[]});
 const before=JSON.stringify(input);deriveControlCenter(input);searchAuthorized({...input,query:'ALFA',customers:input.customerStats});
 buildTrendDays(input.insights,{today});assert.equal(JSON.stringify(input),before);
 const prefs=freeze({order:['exports'],hidden:['drivers']});normalizeActionPreferences(prefs);assert.equal(prefs.order.length,1);
});

test('date helpers use Rome calendar days and reject impossible dates',()=>{
 assert.equal(romeDate(new Date('2026-11-10T23:30:00Z')),'2026-11-11');
 assert.equal(romeDate(new Date('2026-07-10T22:30:00Z')),'2026-07-11');
 assert.equal(romeDate(new Date('invalid')),null);
 assert.equal(isCalendarDay('2026-02-29'),false);assert.equal(isCalendarDay('2024-02-29'),true);
 assert.equal(buildTrendDays(null,{today:'invalid'}).days.length,0);
});

test('operational events have real timestamps and no invented status, distance or deadline',()=>{
 const rows=[trip('old',driverA,'2026-11-09',1000,{updatedAt:'2026-11-10T15:00:00Z'}),
  trip('new',driverA,today,2000,{updatedAt:'2026-11-11T09:00:00Z'})];
 const result=deriveControlCenter({today,insights:insights(rows,{alerts:[{type:'sync',driverId:driverA,detail:'Archivio senza sincronizzazioni da 7 giorni'}],alertTotal:1}),
  customerStats:{customers:[{name:'ALFA'},{name:'BETA',updatedAt:'2026-11-11T12:00:00Z'}]}});
 assert.equal(result.recentTrips[0].id,'new');assert.equal(result.operations.updates[0].kind,'customer');
 assert.equal(result.operations.updates.length,3);assert.equal(result.operations.syncAlerts.length,1);
 for(const row of result.recentTrips){assert(!Object.hasOwn(row,'status'));assert(!Object.hasOwn(row,'kilometres'));assert(!Object.hasOwn(row,'dueAt'));}
});

test('malformed catalog and roster snapshots do not crash or create replacement totals',()=>{
 const result=deriveControlCenter({today,roster:[null],customerStats:{customers:[null]}});
 assert.equal(result.kpis.driversTotal,null);assert.equal(result.kpis.companyCustomers,null);
});
