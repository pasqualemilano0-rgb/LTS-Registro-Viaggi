/** Build the synthetic LTS QA site. Never include GitHub/CI, tests or server code. */
import {cpSync,copyFileSync,existsSync,mkdirSync,readdirSync,rmSync,statSync} from 'node:fs';
import {resolve,relative,extname,dirname,sep} from 'node:path';

const base=resolve('.');
const out=resolve(base,'qa-dist');
const allowedExtensions=new Set([
 '.html','.mjs','.js','.css','.json','.webmanifest',
 '.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.mp4','.pdf','.LICENSE'
]);
const publicFolders=['assets','shared','amministratore','porti','effeerre','privacy'];
const forbidden=['server','tests','supabase','.github','scripts'];
const denySensitive=/\.(?:env|pem|key|crt|map)$/i;
let fileCount=0;
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
function copyIfSafe(source,destination) {
 const rel=relative(base,source);
 if(rel.startsWith('..')||rel.split(sep).some(s=>s.startsWith('.')&&s!=='.nojekyll'))return;
 const ext=extname(source);
 if(denySensitive.test(source)||(!allowedExtensions.has(ext)&&!source.endsWith('.LICENSE')))return;
 mkdirSync(dirname(destination),{recursive:true});
 copyFileSync(source,destination);
 fileCount++;
}
function copyDirectory(folder){
 const src=resolve(base,folder);
 if(!existsSync(src))return;
 function walk(rel){
  const path=resolve(base,rel);
  for(const entry of readdirSync(path,{withFileTypes:true})){
   const next=rel+'/'+entry.name;
   if(entry.isDirectory())walk(next);
   else if(entry.isFile())copyIfSafe(resolve(base,next),resolve(out,next));
  }
 }
 walk(folder);
}
for(const entry of readdirSync(base,{withFileTypes:true})){
 if(entry.isFile())copyIfSafe(resolve(base,entry.name),resolve(out,entry.name));
}
for(const folder of publicFolders)copyDirectory(folder);
for(const rel of ['index.html','shell.html','sw.js','app.mjs',
 'account-access.mjs','visual-theme.css','runtime-config.mjs',
 'amministratore/index.html','amministratore/admin.mjs']){
 const dest=resolve(out,rel);
 if(!existsSync(dest)||statSync(dest).size===0)throw new Error('Missing QA asset: '+rel);
}
for(const folder of forbidden)if(existsSync(resolve(out,folder)))
 throw new Error('Private folder escaped into QA deployment: '+folder);
const html=String(await import('node:fs').then(x=>x.readFileSync(resolve(out,'index.html'),'utf8')));
if(!html.includes('QA PRIVATA — SOLO DATI DI PROVA'))
 throw new Error('QA watermark missing from build');
console.log('Built '+fileCount+' static QA assets in qa-dist. No production server included.');
