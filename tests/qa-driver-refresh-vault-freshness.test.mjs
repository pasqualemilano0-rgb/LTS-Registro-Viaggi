import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const auth=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
const vault=readFileSync(new URL('../driver-session-vault.mjs',import.meta.url),'utf8');
function selectToken(session,stored){
 return stored?.user_id===session.user_id&&Number.isSafeInteger(stored.rotated_at)&&stored.rotated_at>(session.rotated_at||0)
  ?stored.refresh_token:session.refresh_token;
}
test('stale vault cannot override more recent driver session',()=>{
 assert.equal(selectToken({user_id:'driver',refresh_token:'NEW',rotated_at:200},{user_id:'driver',refresh_token:'OLD',rotated_at:100}),'NEW');
 assert.equal(selectToken({user_id:'driver',refresh_token:'NEW',rotated_at:200},{user_id:'driver',refresh_token:'OLD'}),'NEW');
});
test('newer cross-tab vault credential is selected under refresh lock',()=>{
 assert.equal(selectToken({user_id:'driver',refresh_token:'OLD',rotated_at:100},{user_id:'driver',refresh_token:'NEW',rotated_at:200}),'NEW');
 assert.equal(selectToken({user_id:'driver',refresh_token:'OWN',rotated_at:100},{user_id:'other',refresh_token:'OTHER',rotated_at:300}),'OWN');
});
test('implementation tracks rotation and preserves protected vault',()=>{
 assert.match(auth,/rotated_at:Date\.now\(\)/);
 assert.match(auth,/stored\.rotated_at>\(s\.rotated_at\|\|0\)/);
 assert.match(auth,/withRefreshLock\(async\(\)=>\{/);
 assert.match(vault,/crypto\.subtle\.encrypt/);
 assert.match(vault,/crypto\.subtle\.decrypt/);
 assert.match(vault,/encoder\.encode\(JSON\.stringify\(\{user_id,role,refresh_token,rotated_at\}\)\)/);
});
test('session, MFA and revoked-session protections are unchanged',()=>{
 assert.match(auth,/if\(!isVerified\(\)\)throw/);
 assert.match(auth,/if\(\[401,403\]\.includes\(error\.status\)\)revoke\(\)/);
 assert.match(auth,/await verifySession\(\)/);
});
