import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/refresh-lts-porti-snapshots.yml',import.meta.url),'utf8');
test('Porti scheduler builds only nonpublic candidates until QA approves release',()=>{
 assert.doesNotMatch(workflow,/git\s+push\b|git\s+commit\b/);
 assert.doesNotMatch(workflow,/contents:\s+write/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.match(workflow,/lts-porti-snapshot-unpublished/);
 assert.match(workflow,/prepare-snapshot-candidate/);
});
