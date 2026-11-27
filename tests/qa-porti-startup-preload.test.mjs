import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Porti preloads the exact versioned local module graph without executing it before authorization',()=>{
 const page=read('porti/index.html'),gate=read('porti-access.mjs'),app=read('porti/app.js');
 const preloads=[...page.matchAll(/<link rel="modulepreload" href="([^"]+)" \/>/g)].map(m=>m[1]);
 const entry=[...gate.matchAll(/await import\('\.\/porti\/([^']+)'\)/g)].map(m=>m[1]);
 const deps=[...app.matchAll(/^import .* from '\.\/([^']+)';/gm)].map(m=>m[1]);
 assert.equal(entry.length,2);
 assert.deepEqual(preloads,[...new Set([...entry,...deps])]);
 assert.ok(preloads.every(url=>/^[\w.-]+\.(?:js|mjs)\?v=[\w-]+$/.test(url)));
 assert.equal((page.match(/<script\b/g)||[]).length,1);
 assert.match(page,/<body hidden>/);
 assert.match(page,/<script type="module" src="\.\.\/porti-access\.mjs\?v=/);
 assert.ok(page.indexOf('rel="modulepreload"')<page.indexOf('<script'));
});
