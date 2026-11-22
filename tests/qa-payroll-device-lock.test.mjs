/**
 * Static no-bypass contract. Dynamic WebAuthn signature verification and mobile
 * behavior MUST still be tested in isolated QA with two fictitious accounts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261118_payroll_device_unlock.sql');
const edge=read('supabase/functions/lts-payroll/index.ts');
const verifier=read('supabase/functions/lts-payroll/device-unlock.mjs');
const transport=read('documenti/document-api.mjs');
const client=read('documenti/device-passkey.mjs');
const screen=read('documenti/driver-documents.mjs');
const html=read('documenti/index.html');

test('PDF list, download, acknowledgement all require server-verified device step-up',()=>{
 assert.match(edge,/if\(actor\.role==='driver'&&\['list','download','acknowledge'\]\.includes\(input\.action\)\)/);
 assert.match(edge,/await requireDocumentUnlock\(api,actor,input\.unlockToken\)/);
 assert.match(verifier,/\.eq\('user_id',actor\.userId\)\s*\.eq\('session_id',actor\.sessionId\)/);
 assert.match(verifier,/\.eq\('token_hash',tokenHash\)/);
 assert.match(verifier,/\.gt\('expires_at',new Date\(\)\.toISOString\(\)\)/);
 assert.match(verifier,/\.is\('revoked_at',null\)/);
 assert.match(verifier,/if\(!data\)fail\(423/);
});

test('WebAuthn origin, RP ID, challenge, user verification, password enrollment enforced',()=>{
 assert.match(verifier,/npm:@simplewebauthn\/server@13\.3\.0/);
 assert.match(verifier,/const RPID=new URL\(ORIGIN\)\.hostname/);
 assert.match(verifier,/expectedOrigin:ORIGIN,expectedRPID:RPID,requireUserVerification:true/);
 assert.match(verifier,/const challenge=await consumeChallenge\(api\.db,actor,input\.challengeId,'register'\)/);
 assert.match(verifier,/const challenge=await consumeChallenge\(api\.db,actor,input\.challengeId,'unlock'\)/);
 assert.match(verifier,/authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'/);
 assert.match(verifier,/await verifyPasswordReentry\(api\.auth,api\.db,actor,input\.password\)/);
 assert.match(verifier,/await privateClient\.rpc\('lts_payroll_claim_enroll_attempt'/);
 assert.match(verifier,/publicClient\.auth\.signInWithPassword/);
 assert.match(verifier,/verified\?\.user\?\.id!==actor\.userId/);
 assert.match(client,/navigator\.credentials\.create/);
 assert.match(client,/navigator\.credentials\.get/);
 assert.match(client,/userVerification:'required'/);
});

test('single-use session-bound challenges and no direct SQL role access',()=>{
 assert.match(sql,/consumed_at is null and expires_at>now\(\)/);
 assert.match(sql,/p_session uuid,p_purpose text/);
 assert.match(sql,/user_id=p_user and session_id=p_session/);
 assert.match(sql,/revoke all on public\.lts_payroll_passkeys from anon,authenticated/);
 assert.match(sql,/revoke all on public\.lts_payroll_device_unlocks from anon,authenticated/);
 assert.match(sql,/revoke all on function public\.lts_payroll_consume_webauthn_challenge\(uuid,uuid,uuid,text\)/);
 assert.match(sql,/revoke all on public\.lts_payroll_enroll_limits from anon,authenticated/);
 assert.match(sql,/return v_attempts<=5/);
});

test('no unlock persists across tabs, storage, background, or more than 3 minutes',()=>{
 assert.match(verifier,/UNLOCK_TTL_MS=180000/);
 assert.match(verifier,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
 assert.match(verifier,/token_hash:await hash\(secret\)/);
 assert.match(transport,/let unlocked=null/);
 assert.match(transport,/export function clearDeviceUnlock\(\)\{unlocked=null;\}/);
 assert.match(transport,/return account\.isVerified\(\)&&account\.getRole\(\)==='driver'/);
 assert.doesNotMatch(transport,/localStorage|sessionStorage|indexedDB|caches\.open/);
 assert.match(screen,/document\.addEventListener\('visibilitychange'/);
 assert.match(screen,/if\(document\.hidden\)\{if\(!deviceBusy\)lockArea\(\);\}/);
 assert.match(screen,/unlockTimer=setTimeout\(\(\)=>lockArea\(\),result\.expiresInMs\)/);
 assert.match(screen,/const device=await api\.deviceStatus\(\)/);
 assert.match(screen,/const credential=await passkey\.verifyPasskey\(options\)/);
 assert.match(screen,/const credential=await passkey\.createPasskey\(options\)/);
 assert.match(html,/id="device-gate"/);
 assert.match(html,/id="device-setup-form"/);
 assert.match(html,/Sblocca con Face ID, impronta o PIN/);
});

test('no password-only path to driver PDFs and no biometric/PIN collection',()=>{
 assert.doesNotMatch(edge,/if\s*\(\s*!passkey\s*\)\s*return.*documents/);
 assert.doesNotMatch(client,/getUserMedia|FaceDetector|localStorage|sessionStorage/);
 assert.match(screen,/showDeviceGate\(device.enrolled\)/);
});

test('QA origin/RP ID and PDF API are explicitly bound to their own environment',()=>{
 assert.match(edge,/LTS_PAYROLL_ALLOWED_ORIGIN/);
 assert.match(verifier,/LTS_PAYROLL_ALLOWED_ORIGIN/);
 assert.match(verifier,/const RPID=new URL\\(ORIGIN\\)\\.hostname/);
 assert.match(transport,/runtime\\.accountAuth\\?\\.payrollEndpoint/);
 assert.match(transport,/url\\.origin!==auth\\.origin/);
 assert.doesNotMatch(transport,/const ENDPOINT='https:\\/\\/otrqynkscpbeyuvdlgpg/);
 assert.match(screen,/function openPdfPreview\\(blob,doc\\)/);
 assert.match(screen,/URL\\.revokeObjectURL\\(url\\)/);
 assert.match(screen,/await api\\.acknowledge\\(doc\\.id\\)/);
 assert.match(html,/Se non confermi rimane in attesa/);
});
