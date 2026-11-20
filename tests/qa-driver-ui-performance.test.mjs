import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPassiveWakeGate,createLazyCustomerChoices} from '../shared/ui-performance.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Three passive wake events trigger one archive sync, then resume after the gap',()=>{
 let now=10_000;
 const shouldRefresh=createPassiveWakeGate({now:()=>now,gapMs:1500});
 assert.equal(shouldRefresh(),true,'first visible event must refresh');
 now+=20;assert.equal(shouldRefresh(),false,'focus after visibility does not start another sync');
 now+=20;assert.equal(shouldRefresh(),false,'pageshow in the same wake is suppressed');
 now+=1500;assert.equal(shouldRefresh(),true,'a later wake can refresh again');
});

test('The passive gate never blocks after clock corrections or invalid timing',()=>{
 let now=12_000;
 const gate=createPassiveWakeGate({now:()=>now});
 assert.equal(gate(),true);
 now=11_000;assert.equal(gate(),true,'clock moved backwards');
 now=11_001;assert.equal(gate(),false);
 now=Number.NaN;assert.equal(gate(),true,'invalid clocks fail open');
 now=15_000;assert.equal(gate(),true);
 assert.throws(()=>createPassiveWakeGate({gapMs:-1}),TypeError);
});

test('Driver customer catalog is built once per form and invalidated on an update',()=>{
 let builds=0,shared=[{name:'A',city:'Napoli'}];
 const cache=createLazyCustomerChoices(()=>{builds++;return [...shared];});
 for(let i=0;i<250;i++)assert.equal(cache.get().length,1);
 assert.equal(builds,1,'typing should not rebuild the combined list');
 shared=[...shared,{name:'B',city:'Roma'}];
 assert.equal(cache.get().length,1,'updates require explicit invalidation');
 cache.invalidate();
 assert.equal(cache.get().length,2,'new shared customer is visible');
 assert.equal(builds,2);
});

test('Only passive wake events are coalesced; real change and auth paths remain direct',()=>{
 const store=source('client-store.mjs');
 const app=source('app.mjs');
 const worker=source('sw.js');
 assert.match(store,/window[.]addEventListener\('online',\s*refreshSoon\)/);
 assert.match(store,/channel\?[.]addEventListener\('message',[\s\S]*?refreshSoon\(\)/);
 assert.match(store,/window[.]addEventListener\('focus',\s*passiveRefreshSoon\)/);
 assert.match(store,/window[.]addEventListener\('pageshow',\s*passiveRefreshSoon\)/);
 assert.match(store,/setInterval\(pollArchive,\s*2000\)/);
 assert.match(app,/await accountAccess[.]verifySession\(\)/);
 assert.match(app,/customerChoicesCache[.]invalidate\(\)/);
 assert.match(app,/customerChoicesCache[.]get\(\)/);
 assert.match(worker,/\/LTS-Registro-Viaggi\/shared\/ui-performance[.]mjs/);
 assert.match(worker,/shared\/ui-performance[.]mjs/);
});
