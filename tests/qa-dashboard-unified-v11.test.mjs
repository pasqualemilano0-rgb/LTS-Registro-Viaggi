import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('All administrator views share a title without replacing any authenticated panel',()=>{
 const html=read('amministratore/index.html');
 const logic=read('amministratore/report.mjs');
 assert.match(html,/id="workspace-bar"/);
 assert.match(html,/id="workspace-title"/);
 assert.match(html,/id="workspace-description"/);
 assert.match(logic,/workspaceTitle\.textContent=current\[0\]/);
 for(const id of ['overview-tab','management-tab','report-tab','analysis-tab',
  'records-tab','rates-tab','alerts-tab','exports-tab','security-tab',
  'management-panel','admin-records-panel','report-panel','company-rates','pro-insights'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(logic,/if\(lastView==='records'&&view!=='records'&&!records\.canLeave\(\)\)return/);
});
test('Home commands are real buttons, approval stays on top and all ten sections keep layout support',()=>{
 const html=read('amministratore/index.html'),css=read('amministratore/dashboard-unified-v11.css');
 assert.match(css,/#dashboard\[data-view="overview"\] #report-panel>#maps-approvals\{order:1\}/);
 assert.match(css,/#dashboard\[data-view="overview"\] #report-panel>\.report-kpis\{order:2\}/);
 assert.match(css,/scroll-snap-type:x proximity/);
 for(const marker of ['data-smart-open','data-open-section="drivers"',
  'data-open-section="trips"','data-open-section="records"',
  'data-open-private-customers','data-open-maps','data-open-section="rates"',
  'data-open-section="alerts"','data-open-section="exports"'])assert.match(html,new RegExp(marker));
 assert.match(css,/#dashboard #maps-approvals\[data-pending="true"\]/);
 assert.match(css,/#dashboard #maps-approvals\[data-empty="true"\]/);
 assert.match(read('amministratore/maps-approvals.mjs'),/panel\.dataset\.pending=/);
});
test('Design file is versioned, mobile-first, touch accessible, and not privileged',()=>{
 const html=read('amministratore/index.html'),css=read('amministratore/dashboard-unified-v11.css');
 assert.match(html,/dashboard-unified-v11\.css\?v=20261110-rates-visibility-v2/);
 assert.match(html,/admin\.mjs\?v=20261111-smart-realtime-v1/);
 assert.match(read('amministratore/admin.mjs'),/report\.mjs\?v=20261111-smart-realtime-v1/);
 assert.match(css,/@media\(max-width:1029px\)/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/https?:\/\/|@import|javascript:|service_role|sb_secret_/i);
});


test('Tariff editor appears ONLY in Tariffe and its heading remains legible',()=>{
 const css=read('amministratore/dashboard-unified-v11.css');
 const old=read('amministratore/company-rates.css');
 assert.match(old,/#company-rates\{display:none\}/);
 assert.match(css,/#dashboard:not\(\[data-view="rates"\]\) #company-rates\{display:none!important\}/);
 assert.match(css,/#dashboard\[data-view="rates"\] #company-rates\{display:grid/);
 assert.doesNotMatch(css,/#dashboard #company-rates\{display:grid/);
 assert.match(css,/#dashboard\[data-view="rates"\] #company-rates \.company-rates-heading h1\{\s*color:#173849/);
 assert.match(css,/#dashboard\[data-view="rates"\] #report-panel > #maps-approvals\{\s*display:block!important/);
 const page=read('amministratore/index.html');
 assert.match(page,/sedi Google Maps proposte dagli autisti richiedono approvazione e tariffa/);
});
