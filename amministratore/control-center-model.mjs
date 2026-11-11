/** Read-only selectors over responses already authorized by the administrative API. */
import {driverSummary} from './model.mjs';

export const ADMIN_ACTIONS=Object.freeze([
 ['drivers','Gestione autisti','users'],['trips','Registro viaggi','truck'],
 ['records','Archivi autisti','archive'],['customers','Clienti aziendali','clients'],
 ['rates','Tariffe aziendali','wallet'],['approvals','Approvazioni Google Maps','pin'],
 ['analysis','Analisi e grafici','chart'],['alerts','Centro anomalie','alert'],
 ['exports','Esportazioni e report','download'],['security','Sicurezza account','shield']
].map(([id,label,icon])=>Object.freeze({id,label,icon})));
const ACTION_IDS=new Set(ADMIN_ACTIONS.map(item=>item.id));
const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value:'';
const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleLowerCase('it-IT').replace(/\s+/gu,' ').trim();
const compare=(a,b)=>String(a).localeCompare(String(b),'it',{sensitivity:'base',numeric:true});
const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/u.test(value);
export function isCalendarDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
 const time=Date.parse(value+'T12:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function romeDate(value=new Date()){
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=name=>parts.find(p=>p.type===name)?.value;
 return part('year')+'-'+part('month')+'-'+part('day');
}
function shiftDay(day,offset){
 return new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
}
function sum(values){
 let total=0;
 for(const value of values){if(integer(value)===null||!Number.isSafeInteger(total+value))return null;total+=value;}
 return total;
}
function validRange(insights){
 const from=insights?.range?.fromDate,to=insights?.range?.toDate;
 return isCalendarDay(from)&&isCalendarDay(to)&&from<=to;
}
function recordAmount(row){return integer(row?.amountCents)??integer(row?.totalCents);}
export function hasCompleteInsightRecords(insights){
 if(!validRange(insights)||!Array.isArray(insights?.records)
   ||integer(insights?.summary?.trips)===null
   ||insights.records.length!==insights.summary.trips)return false;
 const identities=new Set();
 return insights.records.every(row=>{
  if(!row||typeof row!=='object'||!isCalendarDay(row.date)
   ||row.date<insights.range.fromDate||row.date>insights.range.toDate
   ||typeof row.driverId!=='string'||row.driverId.length===0
   ||typeof row.id!=='string'||row.id.length===0||recordAmount(row)===null)return false;
  const identity=JSON.stringify([row.driverId,row.id]);
  if(identities.has(identity))return false;
  identities.add(identity);return true;
 });
}

/** Preferences contain IDs and booleans only, never company records or account tokens. */
export function normalizeActionPreferences(value={}){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const order=[...new Set(list(source.order).filter(id=>ACTION_IDS.has(id)))];
 for(const item of ADMIN_ACTIONS)if(!order.includes(item.id))order.push(item.id);
 let hidden=[...new Set(list(source.hidden).filter(id=>ACTION_IDS.has(id)))];
 if(hidden.length===order.length)hidden=hidden.filter(id=>id!==order[0]);
 return {order,hidden};
}

/** A zero is emitted only for a date inside the API's confirmed range. */
export function buildTrendDays(insights,{today=romeDate(),days=30}={}){
 const count=Number.isInteger(days)&&days>=1&&days<=366?days:30;
 if(!isCalendarDay(today))return {days:[],complete:false,fromDate:null,toDate:null};
 const start=shiftDay(today,1-count);
 const responseValid=validRange(insights)&&Array.isArray(insights?.daily)
  &&integer(insights?.summary?.trips)!==null;
 const recordsComplete=hasCompleteInsightRecords(insights);
 const mapped=new Map();let dailyValid=responseValid;
 if(responseValid){
  for(const row of insights.daily){
   if(!row||!isCalendarDay(row.date)||integer(row.trips)===null||mapped.has(row.date)
       ||row.date<insights.range.fromDate||row.date>insights.range.toDate){dailyValid=false;break;}
   mapped.set(row.date,{count:row.trips,totalCents:integer(row.totalCents)});
  }
  if(dailyValid&&sum([...mapped.values()].map(row=>row.count))!==insights.summary.trips)dailyValid=false;
 }
 if(recordsComplete){
  mapped.clear();
  for(const row of insights.records){
   const bucket=mapped.get(row.date)||{count:0,totalCents:0};
   bucket.count++;bucket.totalCents=sum([bucket.totalCents,recordAmount(row)]);mapped.set(row.date,bucket);
  }
  dailyValid=true;
 }
 const result=[];
 for(let offset=0;offset<count;offset++){
  const date=shiftDay(start,offset);
  const covered=dailyValid&&date>=insights.range.fromDate&&date<=insights.range.toDate;
  const value=mapped.get(date);
  result.push({date,count:covered?(value?.count??0):null,
   totalCents:covered?(value?value.totalCents:0):null,known:covered});
 }
 return {days:result,complete:result.every(day=>day.known),fromDate:start,toDate:today};
}
function todayTrips(report,today){
 if(!isCalendarDay(today)||!validMonth(report?.month)||!today.startsWith(report.month+'-')
  ||!Array.isArray(report.chart)||integer(report?.summary?.trips)===null)return null;
 const seen=new Set();
 for(const row of report.chart){
  if(!isCalendarDay(row?.date)||!row.date.startsWith(report.month+'-')
      ||integer(row.count)===null||seen.has(row.date))return null;
  seen.add(row.date);
 }
 if(sum(report.chart.map(row=>row.count))!==report.summary.trips)return null;
 return report.chart.find(row=>row.date===today)?.count??0;
}
function recent(records,limit=6){
 return records.filter(row=>row&&isCalendarDay(row.date)).slice().sort((a,b)=>
  b.date.localeCompare(a.date)||text(b.updatedAt).localeCompare(text(a.updatedAt))
  ||compare(a.driverId,b.driverId)||compare(a.id,b.id)).slice(0,limit);
}
function groupRecords(records,kind){
 const map=new Map();
 for(const row of records){
  const id=kind==='drivers'?row.driverId:text(row[kind==='clients'?'client':'city']);
  const name=kind==='drivers'?text(row.driverName)||'Autista senza nome':id||
   (kind==='clients'?'Cliente non indicato':'Località non indicata');
  const found=map.get(id)||{id,name,count:0,totalCents:0};
  found.count++;found.totalCents=sum([found.totalCents,recordAmount(row)]);map.set(id,found);
 }
 return [...map.values()].sort((a,b)=>b.count-a.count||compare(a.name,b.name)||compare(a.id,b.id));
}
function returnedAlerts(insights){
 return list(insights?.alerts).filter(row=>row&&typeof row==='object'&&typeof row.type==='string');
}
function alertGroups(insights){
 if(integer(insights?.alertTotal)===null||!Array.isArray(insights?.alerts))return [];
 const names={tariff:'Tariffe incomplete',duplicate:'Possibili duplicati',sync:'Archivi da verificare',archive:'Archivi non leggibili'};
 const groups=new Map();
 for(const item of returnedAlerts(insights)){
  const id=item.type;
  const bucket=groups.get(id)||{id,name:names[id]||'Altre segnalazioni',count:0};
  bucket.count++;groups.set(id,bucket);
 }
 return [...groups.values()].sort((a,b)=>b.count-a.count||compare(a.name,b.name));
}
function updateEvents(records,customers){
 const events=[];
 for(const row of records){
  const stamp=Date.parse(row.updatedAt);
  if(Number.isFinite(stamp))events.push({kind:'trip',at:row.updatedAt,row,
   label:'Viaggio aggiornato',id:'trip:'+row.driverId+':'+row.id});
 }
 for(const row of customers){
  const at=row?.updatedAt??row?.updated_at;const stamp=Date.parse(at);
  if(Number.isFinite(stamp))events.push({kind:'customer',at,row,
   label:'Scheda cliente aggiornata',id:'customer:'+String(row.id??row.siteId??row.name??'')});
 }
 return events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||compare(a.id,b.id)).slice(0,5);
}
function uniqueOptions(values){
 return [...new Set(values.filter(value=>typeof value==='string'&&value.trim().length>0))].sort(compare);
}

/** No identity joins by name: roster phones and report UUIDs remain separate. */
export function deriveControlCenter({roster=null,report=null,insights=null,customerStats=null,
 approvals=null,today=romeDate()}={}){
 const rosterKnown=Array.isArray(roster)&&roster.every(row=>row&&typeof row==='object'&&typeof row.status==='string'),driverCounts=rosterKnown?driverSummary(roster):null;
 const customers=Array.isArray(customerStats?.customers)&&customerStats.customers.every(row=>row&&typeof row==='object')?customerStats.customers:null;
 const complete=hasCompleteInsightRecords(insights);
 const records=complete?insights.records:[];
 const paged=list(report?.trips);
 const alerts=returnedAlerts(insights);
 const pending=Array.isArray(approvals)?approvals:null;
 const month=validMonth(report?.month)?report.month:validMonth(insights?.month)?insights.month:null;
 const totalAlerts=integer(insights?.alertTotal);
 const missing=integer(report?.summary?.missingTariffCount);
 const unreadable=integer(report?.incompleteArchives)??integer(insights?.incompleteArchives);
 const reportMonthKnown=validMonth(report?.month);
 const monthCents=reportMonthKnown?integer(report?.summary?.knownTotalCents):null;
 const monthlyIncomplete=integer(report?.incompleteArchives);
 const monthPartial=reportMonthKnown?((missing!==null&&missing>0)||(monthlyIncomplete!==null&&monthlyIncomplete>0)):null;
 return {
  kpis:{driversTotal:driverCounts?.total??null,driversActive:driverCounts?.active??null,
   tripsToday:todayTrips(report,today),tripsMonth:reportMonthKnown?integer(report?.summary?.trips):null,
   faresMonthCents:monthCents,companyCustomers:customers?customers.length:null,
   anomalies:totalAlerts,pendingApprovals:pending?pending.length:null},
  month,today,monthPartial,partial:insights?.partial===true||(missing!==null&&missing>0)||(unreadable!==null&&unreadable>0),
  missingTariffCount:missing,incompleteArchives:unreadable,
  reportedAt:typeof report?.reportedAt==='string'?report.reportedAt:null,
  insightsReportedAt:typeof insights?.reportedAt==='string'?insights.reportedAt:null,
  recentTrips:recent(complete?records:paged),
  charts:{daily:buildTrendDays(insights,{today}),drivers:complete?groupRecords(records,'drivers'):[],
   monthly:list(insights?.monthly).filter(row=>validMonth(row?.month)&&integer(row.trips)!==null&&integer(row.totalCents)!==null)
    .map(row=>({...row})),
   clients:complete?groupRecords(records,'clients'):[],cities:complete?groupRecords(records,'cities'):[],
   anomalies:alertGroups(insights)},
  scope:{recordsComplete:complete,tripSearch:complete?'complete-period':report?'loaded-page':'unavailable',
   monthly:'whole-months-driver-only',alertsTotal:totalAlerts,alertsLoaded:alerts.length,
   alertsTruncated:totalAlerts!==null&&totalAlerts>alerts.length,
   pendingApprovalsCapped:pending!==null&&pending.length>=100,
   approvalLimit:100,customerUnit:'Sedi registrate',range:validRange(insights)?{...insights.range}:null,
   selection:insights?.selection?{...insights.selection}:null,
   monthlyValue:'Tariffe dei viaggi registrati; non fatturato emesso o incassato'},
  operations:{approvals:pending?pending.slice(0,5):[],alerts:alerts.slice(0,5),
   syncAlerts:alerts.filter(row=>row.type==='sync').slice(0,5),
   updates:updateEvents(complete?records:paged,customers||[])},
  options:{drivers:list(report?.drivers).map(row=>({id:row.id,name:row.name,active:row.active})),
   clients:uniqueOptions([...list(insights?.options?.clients),...records.map(row=>row.client)]),
   cities:uniqueOptions([...list(insights?.options?.cities),...records.map(row=>row.city)])}
 };
}

/** Search is limited to data already loaded by authenticated, authorized requests. */
export function searchAuthorized({query='',roster=null,report=null,insights=null,customers=null,limit=6}={}){
 const needle=normalize(query),cap=Number.isInteger(limit)?Math.max(1,Math.min(20,limit)):6;
 const complete=hasCompleteInsightRecords(insights);
 const tripRows=complete?insights.records:list(report?.trips);
 const scope=complete?'complete-period':report?'loaded-page':'unavailable';
 const empty={drivers:[],customers:[],trips:[],localities:[],scope};
 if(!needle)return empty;
 function pick(rows,kind,label,haystack){
  return rows.filter(row=>row&&normalize(haystack(row)).includes(needle))
   .map(row=>({kind,row,label:String(label(row)||'')}))
   .sort((a,b)=>{
    const left=normalize(a.label),right=normalize(b.label);
    return Number(!left.startsWith(needle))-Number(!right.startsWith(needle))||compare(a.label,b.label);
   }).slice(0,cap);
 }
 const customerRows=Array.isArray(customers)?customers:list(customers?.customers);
 const localities=uniqueOptions([...tripRows.map(row=>row.city),...customerRows.map(row=>row.city)]);
 return {
  drivers:pick(list(roster),'driver',row=>[row.firstName,row.lastName].filter(Boolean).join(' '),
   row=>[row.firstName,row.lastName,row.phone].join(' ')),
  customers:pick(customerRows,'customer',row=>row.name,
   row=>[row.name,row.city,row.address].join(' ')),
  trips:pick(tripRows,'trip',row=>row.container||row.client,
   row=>[row.container,row.client,row.city,row.driverName,row.date].join(' ')),
  localities:localities.filter(city=>normalize(city).includes(needle)).slice(0,cap)
   .map(city=>({kind:'locality',label:city,row:{city}})),scope
 };
}
