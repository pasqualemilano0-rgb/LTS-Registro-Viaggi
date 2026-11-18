import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrip,emptyState,tripAmounts,validateState,monthlySummary} from '../shared/domain.mjs';
import {findMultiStopFare,singleFareDecision} from '../shared/multi-stop-fares.mjs';
import {reportRows} from '../shared/pdf.mjs';
import {restoreTripEditorSnapshot,TRIP_DRAFT_VERSION} from '../shared/trip-editor-safety.mjs';
import {quickTripFromRoute} from '../shared/quick-trip.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const draft={date:'2026-11-18',container:'MSDU3456768',client:'CLIENTE ALFA',
 city:'NAPOLI',secondClient:'CLIENTE BETA',secondCity:'CASERTA',
 services:[],note:''};
const pair={id:'a',client:'CLIENTE ALFA',city:'NAPOLI',
 secondClient:'CLIENTE BETA',secondCity:'CASERTA',cents:20000,enabled:true};

test('one container + two stops + one fare counts exactly once',()=>{
 const trip=createTrip({...draft,fareMode:'single'},emptyState());
 trip.fareCents=pair.cents;trip.secondFareCents=null;
 assert.equal(trip.sumPickupFares,false);
 assert.equal(tripAmounts(trip).totalCents,20000);
 const state=validateState({...emptyState(),trips:[trip]});
 assert.equal(state.trips[0].sumPickupFares,false);
 assert.equal(state.trips[0].secondClient,'CLIENTE BETA');
 assert.equal(monthlySummary(state,'2026-11').totalCents,20000);
 assert.equal(monthlySummary(state,'2026-11').count,1);
});

test('existing double-fare mode and missing fareMode continue to add both prices',()=>{
 for(const mode of ['double',undefined]){
  const trip=createTrip({...draft,...(mode?{fareMode:mode}:{})},emptyState());
  trip.fareCents=8500;trip.secondFareCents=7500;
  assert.equal(trip.sumPickupFares,true);
  assert.equal(tripAmounts(trip).totalCents,16000);
 }
});

test('one customer cannot request a single multi-stop price',()=>{
 const input={...draft,secondClient:'',secondCity:'',fareMode:'single'};
 assert.throws(()=>createTrip(input,emptyState()),/scarico a tariffa unica/);
 assert.throws(()=>createTrip({...draft,fareMode:'any'},emptyState()),/Modalità tariffaria/);
});

test('only exact ordered and admin-enabled pairs can expose a single fare',()=>{
 assert.equal(findMultiStopFare([pair],'cliente alfa','Napoli','CLIENTE BETA','Caserta')?.cents,20000);
 assert.equal(findMultiStopFare([pair],'CLIENTE BETA','CASERTA','CLIENTE ALFA','NAPOLI'),null);
 assert.equal(findMultiStopFare([pair],'CLIENTE ALFA','SALERNO','CLIENTE BETA','CASERTA'),null);
 assert.equal(findMultiStopFare([{...pair,enabled:false}],...[
  draft.client,draft.city,draft.secondClient,draft.secondCity]),null);
 assert.equal(singleFareDecision({rows:[pair],loaded:false,...draft}).allowed,false);
 assert.equal(singleFareDecision({rows:[pair],loaded:true,...draft}).cents,20000);
 assert.equal(singleFareDecision({rows:[{...pair,cents:0}],loaded:true,...draft}).cents,0);
});

test('editing unchanged historical multi-stop retains paid amount even if admin updates fare',()=>{
 const existing=createTrip({...draft,fareMode:'single'},emptyState());
 existing.fareCents=15000;existing.secondFareCents=null;
 const newer={...pair,cents:24000};
 const decision=singleFareDecision({rows:[newer],loaded:true,...draft,existing});
 assert.equal(decision.allowed,true);
 assert.equal(decision.cents,15000);
 assert.equal(singleFareDecision({rows:[],loaded:true,...draft,existing}).cents,15000);
 assert.equal(singleFareDecision({rows:[],loaded:true,...draft,existing:{
  ...existing,secondCity:'AVELLINO'}}).allowed,false);
});

test('PDF keeps a single container row, both customers and places, no prices',()=>{
 const trip=createTrip({...draft,fareMode:'single'},emptyState());
 trip.fareCents=20000;trip.secondFareCents=null;
 const row=reportRows({...emptyState(),trips:[trip]},'2026-11');
 assert.equal(row.length,1);
 assert.equal(row[0][1],'MSDU345676.8');
 assert.equal(row[0][2],'1. NAPOLI\n2. CASERTA');
 assert.equal(row[0][3],'1. CLIENTE ALFA\n2. CLIENTE BETA');
 assert.equal(row[0].join('|').includes('200'),false);
 assert.equal(row[0].length,5);
});

test('draft recovery keeps selection but repeat-route never inherits single fare',()=>{
 const saved=restoreTripEditorSnapshot({version:TRIP_DRAFT_VERSION,draft:{
  ...draft,fareMode:'single',second:true},editingId:null},[]);
 assert.equal(saved.draft.fareMode,'single');
 assert.equal(quickTripFromRoute({...draft,sumPickupFares:false},'2026-11-19').fareMode,'double');
});

test('admin-only backend writes, fail-closed migration and driver source checks',()=>{
 const handler=read('supabase/functions/lts-company-tariffs/tariff-handler.mjs');
 const sql=read('supabase/migrations/20261118102700_lts_multi_stop_single_fares.sql');
 const app=read('app.mjs'),access=read('account-access.mjs'),admin=read('amministratore/company-multi-stop.mjs');
 assert.ok(handler.includes("input.action==='multi-save'&&account.role==='admin'"));
 assert.ok(handler.includes('requireAdminMfa('));
 assert.ok(handler.includes("eq('revision',input.expectedRevision)"));
 assert.ok(sql.includes('enable row level security'));
 assert.ok(sql.includes('revoke all on public.lts_company_multi_stop_fares from public, anon, authenticated'));
 assert.ok(access.includes("['list','save','extra-save','multi-save']"));
 assert.ok(admin.includes("account.companyTariffs('multi-save',payload)"));
 assert.ok(app.includes('if(isSingle&&!decision.allowed)'));
 assert.ok(app.includes('trip.sumPickupFares=Boolean(trip.secondCity&&!isSingle)'));
});
