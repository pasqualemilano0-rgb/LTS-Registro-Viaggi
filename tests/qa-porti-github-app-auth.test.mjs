import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey,verify,webcrypto} from 'node:crypto';
import {appInstallationToken,publish} from '../cloudflare/public-snapshot-publisher/index.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
const env={GITHUB_APP_ID:'5741661',GITHUB_APP_INSTALLATION_ID:'181532287',GITHUB_APP_PRIVATE_KEY:pem};
const b64url=s=>Buffer.from(s,'base64url').toString('utf8');
test('GitHub App JWT is correctly RS256 signed and installation token is repository scoped',async()=>{
 let called=0;
 const token=await appInstallationToken(env,{now:Date.parse('2026-11-13T10:00:00Z'),fetcher:async(url,opts)=>{
   called++;
   assert.equal(url,'https://api.github.com/app/installations/181532287/access_tokens');
   assert.equal(opts.method,'POST');
   const jwt=opts.headers.Authorization.slice(7);
   const parts=jwt.split('.');
   assert.equal(parts.length,3);
   assert.equal(JSON.parse(b64url(parts[0])).alg,'RS256');
   const claims=JSON.parse(b64url(parts[1]));
   assert.equal(claims.iss,'5741661');
   assert.equal(claims.exp-claims.iat,600);
   assert.equal(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')),true);
   assert.deepEqual(JSON.parse(opts.body),{repositories:['LTS-Registro-Viaggi'],permissions:{contents:'write'}});
   return {ok:true,redirected:false,status:201,text:async()=>JSON.stringify({token:'installation-token-valid-12345'})};
 }});
 assert.equal(token,'installation-token-valid-12345');
 assert.equal(called,1);
});
test('GitHub App accepts escaped PEM newlines',async()=>{
 const token=await appInstallationToken({...env,GITHUB_APP_PRIVATE_KEY:pem.replace(/\n/g,'\\n')},{fetcher:async()=>({ok:true,redirected:false,status:201,text:async()=>JSON.stringify({token:'installation-token-valid-12345'})})});
 assert.equal(token,'installation-token-valid-12345');
});
test('bad App ID and key fail before any network access',async()=>{
 for(const change of [{GITHUB_APP_ID:'not-a-number'},{GITHUB_APP_PRIVATE_KEY:'invalid'}]){
   let calls=0;
   await assert.rejects(appInstallationToken({...env,...change},{fetcher:async()=>{calls++;throw Error('network');}}),/APP_IDS_INVALID|APP_PRIVATE_KEY_INVALID/);
   assert.equal(calls,0);
 }
});
test('HTTP rejection and malformed responses fail closed',async()=>{
 await assert.rejects(appInstallationToken(env,{fetcher:async()=>({ok:false,redirected:false,status:403,text:async()=>''})}),/APP_TOKEN_HTTP_403/);
 await assert.rejects(appInstallationToken(env,{fetcher:async()=>({ok:true,redirected:false,status:201,text:async()=>'{bad'})}),/APP_TOKEN_INVALID_RESPONSE/);
});
test('disabled publisher performs no network calls',async()=>{
 let calls=0;
 await assert.rejects(publish({...env,PUBLISH_ENABLED:'no'},{fetcher:async()=>{calls++;throw Error('network');}}),/PUBLISH_DISABLED_OR_SECRET_MISSING/);
 assert.equal(calls,0);
});
test('incomplete App configuration never falls back to personal token',async()=>{
 let calls=0;
 await assert.rejects(publish({PUBLISH_ENABLED:'yes',GITHUB_APP_ID:'5741661',GITHUB_PUBLIC_CONTENTS_TOKEN:'personal-token-should-not-be-used'},{fetcher:async()=>{calls++;throw Error('network');}}),/APP_IDS_INVALID/);
 assert.equal(calls,0);
});
