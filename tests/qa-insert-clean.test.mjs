import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('insert screen never mounts last-trip preview, including on refresh',()=>{
 const app=read('app.mjs');
 const start=app.indexOf('function renderInsert(main){'),end=app.indexOf('function citySuggestions(',start);
 assert.ok(start>=0&&end>start);
 const insert=app.slice(start,end);
 assert.doesNotMatch(insert,/recent-preview|recent-heading|L’ULTIMO VIAGGIO|Pronto a partire|recent\.replaceChildren/);
 assert.match(insert,/layout\.append\(form\)/);
 assert.match(insert,/main\.append\(layout\)/);
 assert.match(insert,/refreshView=\(\)=>\{/);
 assert.match(insert,/Ripeti ultimo percorso/);
 assert.match(app,/function renderRegister\(/);
 assert.match(app,/function tripCard\(/);
 assert.match(read('app.css'),/\.view-insert \.form-layout\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
});
