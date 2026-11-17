/** LTS public PWA security boundary — automatically runs in the existing CircleCI node --test tests/*.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleAdminRecords} from '../server/admin-records-core.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ORIGIN='https://pasqualemilano0-rgb.github.io';

test('admin records reject cross-origin requests without opening database clients',async()=>{
  const req=new Request('https://api.example.test/functions/v1/lts-admin-records',{
    method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},
    body:JSON.stringify({action:'list'})
  });
  const response=await handleAdminRecords(req,{getClients(){throw new Error('DATABASE_MUST_NOT_BE_USED');}});
  assert.equal(response.status,403);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('admin records retain server-side role, session and MFA authorization',()=>{
  const source=read('server/admin-records-core.mjs');
  assert.match(source,/auth\.getUser\(/);
  assert.match(source,/checkLtsSession\(/);
  assert.match(source,/requireAdminMfa\(/);
  assert.match(source,/mfa\?\.enrolled\s*!==\s*true\s*\|\|\s*mfa\?\.verified\s*!==\s*true/);
});

test('browser code has no direct HTML injection sinks or privileged Supabase keys',()=>{
  const files=[
    'app.mjs','amministratore/admin.mjs','amministratore/driver-records.mjs',
    'amministratore/report-insights.mjs','recupera-password.mjs',
    'porti/app.js'
  ];
  const sink=/\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|\bdocument\.write\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/;
  const secret=/sb_secret_[A-Za-z0-9_-]{12,}|SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]/;
  for(const file of files){
    const source=read(file);
    assert.doesNotMatch(source,sink,file+' HTML injection sink');
    assert.doesNotMatch(source,secret,file+' server secret');
  }
});

test('public password-recovery page still fails closed on exposed passwords',()=>{
  const source=read('recupera-password.mjs');
  const security=source.indexOf('if(await compromisedPassword(pass))');
  const update=source.indexOf("requestApi('user',{method:'PUT',body:{password:pass}");
  assert.ok(security>0 && update>security);
  assert.match(source,/Verifica sicurezza password non disponibile/);
});

test('Porti remains a session-gated LTS subview, not an independent login',()=>{
  const source=read('porti-access.mjs');
  assert.match(source,/sameOriginParent\(/);
  assert.match(source,/event\.source!==window\.parent/);
  assert.match(source,/event\.origin!==location\.origin/);
  assert.match(source,/lts-porti-authorized/);
  assert.ok(source.includes('location.replace(BASE)'));
});
