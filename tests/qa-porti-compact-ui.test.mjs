import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('compact Porti presentation preserves booking and port selection controls',()=>{
 const page=read('porti/index.html'),css=read('porti/driver-ui.css');
 assert.match(page,/<body hidden>/);
 assert.match(page,/id="search-form"/);
 assert.match(page,/name="port" value="napoli" checked/);
 assert.match(page,/name="port" value="salerno"/);
 for(const target of ['cnt','tfg']){
  assert.ok(page.includes('data-booking-target="'+target+'"'));
  assert.ok(page.includes('data-open-terminal="'+target+'"'));
 }
 assert.match(page,/id="query"[^>]*aria-describedby="booking-feedback query-help"/);
 assert.match(page,/type="submit" id="search-btn"/);
 assert.ok(page.indexOf('id="search-btn"')<page.indexOf('id="query-help"'));
 assert.match(page,/id="sct-filter"/);
 assert.match(page,/id="sct-search-btn"/);
 assert.equal((page.match(/class="driver-port-icon" aria-hidden="true"><svg/g)||[]).length,2);
 assert.match(css,/\.booking-collapsible #napoli-booking-controls\{border-top:0/);
 assert.match(css,/\.search-panel \.booking-quick-select\{margin:0 0 10px;padding:12px 0 0;border-top:1px/);
 assert.match(css,/\.search-panel \.booking-quick-options button\{min-height:44px/);
 assert.match(css,/\.search-panel \.ship-shortcut\{min-height:48px/);
 assert.match(css,/\.search-panel \.shortcuts-grid\{grid-template-columns:minmax\(0,1fr\)/);
});
