/** Read-only UI contract for the reserved mobile documents page.
 * No live accounts, PDF bytes or production writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('documenti/index.html');
const css=read('documenti/documents.css');
const driver=read('documenti/driver-documents.mjs');

test('mobile layout has one page title, compact navigation and original controls',()=>{
 assert.match(html,/<body class="driver-documents-page">/);
 assert.equal((html.match(/<h1>I miei documenti<\/h1>/g)||[]).length,1);
 for(const id of ['notice','locked','content','refresh','year','category-title','cedolino-info','documents','more']){
  assert.match(html,new RegExp('id="'+id+'"'),'Missing control '+id);
 }
 for(const category of ['cedolino','cu','altri'])
  assert.match(html,new RegExp('data-category="'+category+'"'));
 assert.match(html,/class="category selected" data-category="cedolino" aria-pressed="true"/);
 assert.match(html,/class="category" data-category="cu" aria-pressed="false"/);
 assert.match(html,/class="category" data-category="altri" aria-pressed="false"/);
 assert.match(html,/documents\.css\?v=20261123-mobile-v3/);
 assert.match(css,/\.driver-documents-page \.archive-toolbar\{\s*display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(180px,190px\)/);
 assert.match(css,/@media\(max-width:330px\)/);
 assert.match(css,/Mobile fix v3/);
 assert.match(css,/grid-template-columns:44px minmax\(0,1fr\)/);
 assert.match(css,/padding:10px 40px 10px 13px/);
 assert.match(css,/\.driver-documents-page \.filters select\{\s*display:block;width:100%;min-width:0;max-width:none/);
 assert.match(html,/driver-documents\.mjs\?v=20261123-mobile-v1/);
});

test('the cedolino disclosure is preserved and only visible in its own category',()=>{
 assert.match(html,/<details>/);
 assert.match(html,/Senza conferma il PDF rimane bloccato/);
 assert.match(html,/non equivale a firma, pagamento dello stipendio o accettazione degli importi/);
 assert.match(driver,/\$\('cedolino-info'\)\.hidden=category!=='cedolino'/);
 assert.match(driver,/if\(doc\.category==='cedolino'&&!doc\.acknowledged_at\)/);
 assert.match(driver,/await api\.acknowledge\(doc\.id\)/);
 assert.match(driver,/const file=await api\.download\(doc\.id\)/);
});

test('empty state changes per category without exposing account identifiers',()=>{
 assert.match(driver,/function emptyCategoryState\(\)/);
 assert.match(driver,/Nessun cedolino pubblicato/);
 assert.match(driver,/Nessuna CU pubblicata/);
 assert.match(driver,/if\(!offset\)\$\('documents'\)\.append\(emptyCategoryState\(\)\)/);
 assert.match(css,/\.driver-documents-page \.empty-documents\{/);
 assert.match(css,/\.driver-documents-page \.empty-documents-icon/);
 assert.doesNotMatch(html,/user_id|service_role|sb_secret_|access_token/i);
});

test('scope restyle to the driver page, keep security and profile-return navigation',()=>{
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/frame-ancestors 'none'/);
 assert.match(html,/data-back-to-register/);
 assert.match(driver,/await account\.verifySession\(\)/);
 assert.match(driver,/account\.getRole\(\)!=='driver'/);
 assert.match(driver,/if\(openedFromProfile&&window\.history\.length>1\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.driver-documents-page \.category-nav/);
 assert.match(css,/\.driver-documents-page \.archive-toolbar/);
 assert.match(css,/\.driver-documents-page \.documents-panel/);
 assert.doesNotMatch(html,/<script[^>]*>[^<]+<\/script>/);
});
