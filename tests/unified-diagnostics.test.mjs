import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeReportSync,summarizePortCopies,summarizeMainChecks,summarizeBookingEvidence} from '../amministratore/unified-diagnostics-model.mjs';
import {PORT_SOURCE_FEEDS} from '../shared/port-source-status.mjs';

const now=Date.parse('2026-11-16T13:00:00Z');
test('Sync health is based on verified report timing, not merely WebSocket connectivity',()=>{
 assert.equal(summarizeReportSync(null,'connected',now).kind,'unknown');
 const report={reportedAt:'2026-11-16T12:58:00Z',incompleteArchives:0,stale:false};
 assert.equal(summarizeReportSync(report,'connected',now).kind,'ok');
 assert.equal(summarizeReportSync({...report,stale:true},'connected',now).kind,'warning');
 assert.equal(summarizeReportSync({...report,incompleteArchives:2},'connected',now).kind,'warning');
 assert.equal(summarizeReportSync({...report,reportedAt:'2026-11-16T11:00:00Z'},'connected',now).kind,'warning');
 assert.equal(summarizeReportSync({...report,reportedAt:'2026-11-16T15:00:00Z'},'connected',now).kind,'unknown');
});
test('Port source snapshots never claim that stale or malformed data is fresh',()=>{
 const feed=PORT_SOURCE_FEEDS[0];
 const recent={source:feed.source,acquired_at:'2026-11-16T12:50:00Z',rows:[{vessel:'TEST'}]};
 assert.equal(summarizePortCopies({cnt:recent},now)[0].kind,'ok');
 assert.equal(summarizePortCopies({cnt:{...recent,acquired_at:'2026-11-16T10:00:00Z'}},now)[0].kind,'warning');
 assert.equal(summarizePortCopies({cnt:{...recent,source:'https://fake.invalid'}},now)[0].kind,'unknown');
 assert.equal(summarizePortCopies({},now).filter(x=>x.kind==='unknown').length,3);
});
test('CI is not release status: absence, error and pending are never green',()=>{
 const sha='a'.repeat(40),name='ci/circleci: webapp-regression';
 assert.equal(summarizeMainChecks(null).kind,'unknown');
 assert.equal(summarizeMainChecks({sha,statuses:[]}).kind,'unknown');
 assert.equal(summarizeMainChecks({sha,statuses:[{context:name,state:'success'}]}).kind,'ok');
 assert.match(summarizeMainChecks({sha,statuses:[{context:name,state:'success'}]}).detail,/Non conferma deploy/);
 assert.equal(summarizeMainChecks({sha,statuses:[{context:name,state:'pending'}]}).kind,'warning');
 assert.equal(summarizeMainChecks({sha,statuses:[{context:name,state:'failure'}]}).kind,'warning');
 assert.equal(summarizeBookingEvidence().kind,'unknown');
});
test('Diagnostic view is MFA-gated, read-only, and does not call private Booking APIs',()=>{
 const js=readFileSync(new URL('../amministratore/unified-diagnostics.mjs',import.meta.url),'utf8');
 assert.match(js,/session[?]\.mfa_enrolled!==true[|][|]session[?]\.mfa_verified!==true/);
 assert.match(js,/account[.]verifySession[(][)]/);
 assert.match(js,/getRole[?][.]\(\)==='admin'/); // authenticated role check
 assert.match(js,/lts-account-locked/);
 assert.doesNotMatch(js,/Bearer |service_role|SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|booking\\W+fetch/i);
 assert.match(js,/credentials:'omit'/);
 assert.match(js,/read-only/i);
});
