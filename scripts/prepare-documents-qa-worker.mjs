/** Offline QA-only Worker overlay. Existing content-addressed KV entries are never replaced. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const [baseline,folder,output]=process.argv.slice(2);
if(!baseline||!folder||!output)throw Error('Usage: node scripts/prepare-documents-qa-worker.mjs baseline.mjs assets output-prefix');
const before=readFileSync(baseline,'utf8');
if(!before.includes('const origin="https://lts-test-pr205.pasqualemilano0.workers.dev";')||
 !before.includes('env.QA_GATE_SHA256')||!before.includes('env.QA_ASSETS'))throw Error('Not the expected gated QA Worker');
const manifest=JSON.parse(before.match(/^const ASSETS=(.*);$/m)?.[1]||'null');
const policy=JSON.parse(before.match(/^const POLICY=(.*);$/m)?.[1]||'null');
const csp=policy['Content-Security-Policy'];
if(!csp.includes("frame-src 'none';")||!csp.includes('lts-admin-records;'))throw Error('Review changed CSP manually');
policy['Content-Security-Policy']=csp.replace("frame-src 'none';","frame-src blob:;")
 .replace('lts-admin-records;','lts-admin-records https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-payroll-secure-qa;');
const entries=[],changed=[];
function walk(dir,prefix=''){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  const path=prefix+item.name;
  if(item.isDirectory()){walk(join(dir,item.name),path+'/');continue;}
  if(!item.isFile())throw Error('Non-regular asset');
  const data=readFileSync(join(dir,item.name));
  const hash=createHash('sha256').update(data).digest('hex');
  if(manifest[path]?.[0]===hash)continue;
  const zipped=gzipSync(data,{level:9}),size=24576,count=Math.ceil(zipped.length/size);
  for(let i=0;i<count;i++)entries.push({key:hash+':'+i,value:zipped.subarray(i*size,(i+1)*size).toString('base64'),base64:true});
  manifest[path]=[hash,count,data.length];changed.push(path);
 }
}
walk(resolve(folder));
const code=before.replace(/^const POLICY=.*;$/m,'const POLICY='+JSON.stringify(policy)+';')
 .replace(/^const ASSETS=.*;$/m,'const ASSETS='+JSON.stringify(manifest)+';');
// The Basic verifier, origin checks, response handling and bindings are byte-for-byte preserved.
const strip=s=>s.replace(/^const (POLICY|ASSETS)=.*;$/gm,'');
if(strip(code)!==strip(before))throw Error('Unexpected Worker logic modification');
writeFileSync(output+'.mjs',code);
writeFileSync(output+'.kv.json',JSON.stringify(entries));
writeFileSync(output+'.manifest.json',JSON.stringify({changed,assets:manifest,policy},null,2));
console.log(JSON.stringify({changed,kvKeys:entries.length,workerBytes:Buffer.byteLength(code)}));
