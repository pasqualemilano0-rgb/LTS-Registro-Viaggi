import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sw=read('sw.js');
const root=new URL('../',import.meta.url);
function coreAssetPaths(){
 const chunk=sw.match(/const CORE = \[([\s\S]*?)\];/);
 assert.ok(chunk,'service worker precache CORE list is required');
 return [...chunk[1].matchAll(/["']\/LTS-Registro-Viaggi\/([^"'?#]+)["']/g)].map(m=>m[1]);
}
test('every declared PWA core asset exists and is not an empty placeholder',()=>{
 const files=coreAssetPaths();
 assert.ok(files.length>30,'unexpectedly short offline core list');
 assert.equal(new Set(files).size,files.length,'duplicate precached asset');
 for(const path of files){
  assert.ok(!path.includes('..')&&!path.startsWith('/'),'invalid core path: '+path);
  const url=new URL('../'+path,import.meta.url);
  assert.ok(existsSync(url),'missing precached asset: '+path);
  assert.ok(statSync(url).size>0,'empty precached asset: '+path);
 }
});
test('offline shell stays identical to index and external data is not precached',()=>{
 assert.equal(read('index.html'),read('shell.html'));
 const assets=coreAssetPaths();
 assert.ok(assets.includes('account-access.mjs'));
 assert.ok(assets.includes('visual-theme.css'));
 assert.ok(assets.includes('app.mjs'));
 assert.ok(!assets.some(path=>/^(api\/|functions\/)/.test(path)));
 assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
});
