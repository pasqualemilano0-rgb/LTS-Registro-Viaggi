import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOTES_HTML,NOTES_JS,serveSyntheticNoteQa} from '../supabase/qa/qa-notes-synthetic.mjs';
const req=(path,method='GET')=>new Request('https://qa.invalid'+path,{method});
test('passwordless note demo is strictly synthetic and refuses non-GET',async()=>{
 const page=serveSyntheticNoteQa(req('/qa/notes/'));
 assert.equal(page.status,200);
 assert.match(await page.text(),/SOLO DATI SINTETICI/);
 assert.match(page.headers.get('Content-Security-Policy'),/connect-src 'none'/);
 assert.equal(page.headers.get('Cache-Control'),'no-store');
 assert.equal(serveSyntheticNoteQa(req('/qa/notes/','POST')).status,405);
 assert.equal(serveSyntheticNoteQa(req('/qa/auth.js')),null);
 assert.equal(serveSyntheticNoteQa(req('/qa/notes.js?x=1')).status,400);
 assert.equal(serveSyntheticNoteQa(req('/qa/notes/?next=https://other.invalid')).headers.get('Location'),'/qa/notes/');
 assert.equal(await serveSyntheticNoteQa(req('/qa/notes.js')).text(),NOTES_JS);
});
test('synthetic demo uses exact tested candidate history UI and no external transport',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const start=app.indexOf(" if(editingId&&accountAccess.getRole()==='driver'){");
 const end=app.indexOf(" adminNoteInput.addEventListener('input'",start);
 assert.ok(start>=0&&end>start);
 assert.ok(NOTES_JS.includes(app.slice(start,end)));
 assert.doesNotThrow(()=>new Function(NOTES_JS));
 assert.doesNotMatch(NOTES_JS,/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b|supabase\.co/);
 assert.match(NOTES_HTML,/nessuna credenziale/);
 assert.match(NOTES_JS,/salvataggio simulato/);
});
