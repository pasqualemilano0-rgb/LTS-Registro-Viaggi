import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mustRevalidateOnReturn,FOREGROUND_TRUST_MS,SHORT_BACKGROUND_MS } from '../shared/foreground-resume.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const trusted={verified:true,hasSession:true,sameOwner:true,lastVerifiedAt:100000};
test('Quick app switching never requests an unnecessary foreground login check',()=>{
 assert.equal(mustRevalidateOnReturn({...trusted,backgroundAt:105000,now:110000}),false);
 assert.equal(mustRevalidateOnReturn({...trusted,backgroundAt:110000,now:120000}),false);
 assert.equal(SHORT_BACKGROUND_MS,25000);
 assert.equal(FOREGROUND_TRUST_MS,60000);
});
test('Long pauses, stale checks, identity changes and failed guards always revalidate',()=>{
 assert.equal(mustRevalidateOnReturn({...trusted,backgroundAt:110000,now:140000}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,backgroundAt:105000,now:160000}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,now:110000,verified:false}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,now:110000,hasSession:false}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,now:110000,sameOwner:false}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,now:110000,blocked:true}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,backgroundAt:160000,now:110000}),true);
 assert.equal(mustRevalidateOnReturn({...trusted,lastVerifiedAt:0,now:110000}),true);
});
test('Admin resume keeps current form and scroll; only session failures show blocking overlay',()=>{
 const js=read('amministratore/admin.mjs');
 const page=read('amministratore/index.html');
 const css=read('amministratore/admin-login-refreshed.css');
 assert.match(js,/function showInlineAdminResume\(/);
 assert.match(js,/function hideInlineAdminResume\(/);
 assert.match(js,/dashboard[.]inert=true/);
 assert.match(js,/lastAdminVerifiedAt=Date[.]now\(\)/);
 assert.match(js,/mustRevalidateOnReturn\(\{/);
 assert.match(js,/if\(required\)void verifyDashboardOnResume\(\)/);
 assert.match(js,/showResumeGuard\('Verifica non completata/);
 assert.match(js,/window[.]addEventListener\('pagehide',\(\)=>\{rememberAdminPosition\(\);if\(!dashboard[.]hidden\)adminBackgroundAt=Date[.]now\(\);\}\)/);
 assert.match(page,/id="admin-resume-inline"/);
 assert.match(css,/admin-resume-inline/);
});
