import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRun,classifyStep,summarize,findLatest} from '../status/status.mjs';
const now=Date.parse('2026-11-09T15:00:00Z');
test('run status is stale-safe',()=>{
 assert.equal(classifyRun(null,now),'waiting');
 assert.equal(classifyRun({run_started_at:'2026-11-09T10:00:00Z',status:'completed',conclusion:'success'},now),'stale');
 assert.equal(classifyRun({run_started_at:'2026-11-09T14:00:00Z',status:'completed',conclusion:'success'},now),'ok');
 assert.equal(classifyRun({run_started_at:'2026-11-09T14:00:00Z',status:'completed',conclusion:'failure'},now),'fail');
});
test('missing or skipped step is never operational',()=>{
 assert.equal(classifyStep(null,'ok'),'waiting');
 assert.equal(classifyStep({status:'completed',conclusion:'skipped'},'ok'),'waiting');
 assert.equal(classifyStep({status:'completed',conclusion:'success'},'stale'),'stale');
 assert.equal(classifyStep({status:'completed',conclusion:'failure'},'fail'),'fail');
});
test('aggregate is conservative',()=>{
 assert.equal(summarize(['ok','ok']),'ok');
 assert.equal(summarize(['ok','waiting']),'waiting');
 assert.equal(summarize(['ok','fail']),'fail');
 assert.equal(summarize([]),'waiting');
 assert.equal(findLatest([{name:'one'},{name:'two'}],r=>r.name==='two').name,'two');
});
