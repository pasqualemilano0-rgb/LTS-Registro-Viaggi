import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeText} from '../shared/domain.mjs';
import {quickTripFromRoute} from '../shared/quick-trip.mjs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const start=app.indexOf('  const routeCounts=new Map();');
const end=app.indexOf('  const quick=el(',start);
assert.ok(start>=0&&end>start,'Frequent-route selection must remain testable');
// Execute the actual selection block, with a deterministic sorted history.
const select=new Function('D','state',app.slice(start,end)+'\nreturn frequentRoutes;');
const D={normalizeText,sortTrips:trips=>trips};
const trip=(client,city,secondClient='',secondCity='')=>({client,city,secondClient,secondCity});

test('repeated routes group normalized names and keep the latest representative',()=>{
 const trips=[
  trip(' ACME  ', ' Napoli '),
  trip('acme','NAPOLI'),
  trip('ACME','NAPOLI'),
  trip('ACME','NAPOLI','DEPOSITO A','CASERTA'),
  trip('acme','napoli','deposito a','caserta'),
  trip('ACME','NAPOLI','DEPOSITO B','CASERTA'),
  trip('ACME','NAPOLI','DEPOSITO B','CASERTA'),
  trip('UNICO','ROMA')
 ];
 const routes=select(D,{trips});
 assert.deepEqual(routes.map(({count})=>count),[3,2,2]);
 assert.equal(routes[0].trip,trips[0]);
 assert.equal(routes[1].trip,trips[3]);
 assert.equal(routes[2].trip,trips[5]);
});

test('ignore invalid routes, cap the sample at 100 and show at most 3 suggestions',()=>{
 const history=Array.from({length:4},(_,i)=>[
  trip('CLIENTE'+i,'NAPOLI'),trip('CLIENTE'+i,'NAPOLI')
 ]).flat();
 assert.equal(select(D,{trips:history}).length,3);
 const withInvalid=[trip('','NAPOLI'),trip('SOLO','')];
 assert.deepEqual(select(D,{trips:withInvalid}),[]);
 const hundred=Array.from({length:100},(_,i)=>trip('DISTINTO'+i,'NAPOLI'));
 hundred.push(trip('DISTINTO0','NAPOLI'));
 assert.equal(select(D,{trips:hundred}).length,0);
});

test('route shortcuts preserve second pickup but never copy container, fees or extra services',()=>{
 const copied=quickTripFromRoute({...trip('ACME','NAPOLI','DEPOSITO A','CASERTA'),
  container:'MSDU1234567',services:['reefer'],fareCents:9000,extraCents:{x:200},id:'old',
  note:'private'},'2026-11-16');
 assert.equal(copied.second,true);
 assert.equal(copied.secondClient,'DEPOSITO A');
 assert.equal(copied.secondCity,'CASERTA');
 assert.equal(copied.container,'');
 assert.deepEqual(copied.services,[]);
 assert.equal(copied.note,'');
 for(const key of ['fareCents','extraCents','id'])assert.equal(Object.hasOwn(copied,key),false);
 assert.ok(app.includes("trip.client+' · '+trip.city+second+' ('+count+' viaggi)'"),
  'The UI must label different second pickups distinctly');
});
