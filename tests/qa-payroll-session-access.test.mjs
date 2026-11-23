/**
 * Payroll access contract after optional WebAuthn was removed by request.
 * Session, ownership, private storage and admin MFA must stay mandatory.
 * These static checks do not replace authenticated two-driver QA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const edge=read('supabase/functions/lts-payroll/index.ts');
const qaEdge=read('supabase/qa/functions/lts-payroll-secure-qa/index.ts');
const transport=read('documenti/document-api.mjs');
const screen=read('documenti/driver-documents.mjs');
const html=read('documenti/index.html');

test('driver actions require verified JWT, live LTS session and restricted records',()=>{
 for(const source of [edge,qaEdge]){
  assert.match(source,/auth\.getUser\(match\[1\]\)/);
  assert.match(source,/await checkLtsSession\(api\.db,match\[1\],userId\)/);
  assert.match(source,/if\(!access\|\|access\.enabled!==true\|\|access\.removed_at/);
  assert.match(source,/\.eq\('driver_id',actor\.userId\)\.eq\('state','published'\)/);
  assert.match(source,/data\.driver_id!==actor\.userId\|\|data\.state!=='published'/);
  assert.match(source,/await requireAdminMfa\(/);
  assert.match(source,/mustAdmin\(actor\)/);
  assert.doesNotMatch(source,/deviceAction|requireDocumentUnlock|passkey-|unlockToken/);
 }
});

test('driver document UI uses LTS session only, clears private data when backgrounded',()=>{
 assert.match(screen,/const status=await account\.verifySession\(\)/);
 assert.match(screen,/status\.role!=='driver'\|\|!account\.isVerified\(\)/);
 assert.match(screen,/if\(document\.hidden\)hideDocuments\(\)/);
 assert.match(screen,/closePdfPreview\(\)/);
 assert.match(screen,/URL\.revokeObjectURL\(url\)/);
 assert.match(screen,/await api\.download\(doc\.id\)/);
 assert.match(screen,/await api\.acknowledge\(doc\.id\)/);
 assert.doesNotMatch(screen,/passkey|WebAuthn|deviceBusy|unlockTimer|hasDeviceUnlock|device-gate/i);
 assert.doesNotMatch(html,/Face ID|passkey|impronta|device-gate|Sblocca/i);
 assert.match(html,/id="locked"/);
});

test('transport keeps verified access token and forbids browser storage of PDFs',()=>{
 assert.match(transport,/if\(!account\.isVerified\(\)\)/);
 assert.match(transport,/await account\.getVerifiedAccessToken\(\)/);
 assert.match(transport,/cache:'no-store'/);
 assert.match(transport,/credentials:'omit'/);
 assert.match(transport,/response\.blob\(\)/);
 assert.doesNotMatch(transport,/unlockToken|deviceStatus|deviceUnlockVerify|localStorage|sessionStorage|indexedDB/);
});

test('WebAuthn implementation, schema and static artifacts are absent from candidate',()=>{
 for(const path of [
  'documenti/device-passkey.mjs',
  'supabase/functions/lts-payroll/device-unlock.mjs',
  'supabase/qa/functions/lts-payroll-secure-qa/device-unlock.mjs',
  'supabase/migrations/20261118_payroll_device_unlock.sql',
  'supabase/qa/20261122_payroll_webauthn_qa.sql'
 ]) assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
});
