/** Apply the payroll UI as an isolated overlay to an already exported LTS TEST QA asset directory.
 * Does NOT deploy, call Supabase, or alter production files.
 */
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const QA_ORIGIN='https://lts-test-pr205.pasqualemilano0.workers.dev';
const QA_SUPABASE='https://sywxretbfgwxwhvdcknq.supabase.co';
const QA_ENDPOINT=QA_SUPABASE+'/functions/v1/lts-payroll-secure-qa';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SOURCE_FILES=[
 'documenti/index.html','documenti/documents.css','documenti/driver-documents.mjs',
 'documenti/document-api.mjs','documenti/admin-documents.mjs',
 'amministratore/buste-paga/index.html','amministratore/admin-area-choice.css',
 'amministratore/admin-area-choice.mjs','assets/admin-hero-napoli.svg','assets/admin-card-logistica.svg'
];
function once(contents,anchor,change,label){
 if(!contents.includes(anchor)||contents.indexOf(anchor)!==contents.lastIndexOf(anchor))
  throw Error('QA overlay: expected exactly one anchor in '+label);
 return contents.replace(anchor,change);
}
export function prepareDocumentsQa(root,source=ROOT){
 const folder=resolve(root);
 if(folder===resolve(source))throw Error('QA assets must be in a separate staging directory');
 const runtimePath=join(folder,'runtime-config.mjs');
 const appPath=join(folder,'app.mjs');
 const adminPath=join(folder,'amministratore/index.html');
 let runtime=readFileSync(runtimePath,'utf8');
 if(!runtime.includes('location?.origin!=='+JSON.stringify(QA_ORIGIN))||
    !runtime.includes('"environment": "qa"')||
    !runtime.includes(QA_SUPABASE+'/functions/v1/lts-phone-auth')||
    runtime.includes('otrqynkscpbeyuvdlgpg'))
  throw Error('Refused: runtime not isolated to the real LTS TEST QA origin');
 if(runtime.includes('"payrollEndpoint"'))throw Error('QA payroll endpoint already configured: review manually');
 runtime=once(runtime,'"adminRecordsEndpoint": '+JSON.stringify(QA_SUPABASE+'/functions/v1/lts-admin-records'),
  '"adminRecordsEndpoint": '+JSON.stringify(QA_SUPABASE+'/functions/v1/lts-admin-records')+',\n    "payrollEndpoint": '+JSON.stringify(QA_ENDPOINT),'QA runtime');
 let app=readFileSync(appPath,'utf8');
 if(app.includes("menuButton('I MIEI DOCUMENTI'"))throw Error('QA profile already has a document link');
 const anchor='  const syncInfo=store.getSyncInfo();';
 const newUI=`
  if(store.usingAccount()&&accountAccess.isEnabled()&&accountAccess.isVerified()&&accountAccess.getRole()==='driver'){
   body.querySelector('.profile-menu')?.prepend(menuButton('I MIEI DOCUMENTI',
    'Cedolino, CU e altri PDF riservati. Accesso con account LTS.','download',()=>{
     dialog.close();window.location.assign(new URL('documenti/',import.meta.url).href);
    }));
  }`;
 app=once(app,anchor,anchor+newUI,'QA driver profile');
 let admin=readFileSync(adminPath,'utf8');
 if(admin.includes('href="./buste-paga/"'))throw Error('QA admin document link already exists');
 admin=once(admin,'</header>\n  <main class="container">',`<a href="./buste-paga/" aria-label="Apri gestione documenti riservata">AREA AMMINISTRATIVA · DOCUMENTI</a></header>\n  <main class="container">`,'QA admin HTML');
 const choiceSource=readFileSync(join(source,'amministratore/index.html'),'utf8');
 const start=choiceSource.indexOf('      <div id="admin-area-choice"');
 const end=choiceSource.indexOf('      <div id="admin-logistica-login"',start);
 if(start<0||end<0)throw Error('Missing verified area selector');
 admin=once(admin,'</head>','<link rel="stylesheet" href="./admin-area-choice.css">'+
  '<script type="module" src="./admin-area-choice.mjs"></script></head>','QA chooser assets');
 admin=once(admin,'      <form id="login-form"',choiceSource.slice(start,end)+
  '      <div id="admin-logistica-login" hidden><form id="login-form"','QA logistics login');
 admin=once(admin,'      <div class="login-footer">',
  '<button id="admin-area-back" type="button">Torna alla scelta delle aree</button></div>\n      <div class="login-footer">','QA login footer');
 const writes=[{path:'runtime-config.mjs',text:runtime},{path:'app.mjs',text:app},{path:'amministratore/index.html',text:admin}];
 for(const file of SOURCE_FILES){
  let content=readFileSync(join(source,file),'utf8');
  if(file.endsWith('index.html')){
   if(!content.includes('otrqynkscpbeyuvdlgpg.supabase.co'))throw Error('QA CSP source check failed: '+file);
   content=content.replaceAll('https://otrqynkscpbeyuvdlgpg.supabase.co',QA_SUPABASE);
  }
  writes.push({path:file,text:content});
 }
 // Validate every input before writing anything to the working directory.
 const excluded=/otrqynkscpbeyuvdlgpg|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/;
 for(const {path,text} of writes)if(excluded.test(text)&&path!=='app.mjs')
  throw Error('Unapproved production endpoint or secret in QA artifact '+path);
 for(const {path,text} of writes){
  const destination=join(folder,path);
  mkdirSync(dirname(destination),{recursive:true});
  writeFileSync(destination,text,'utf8');
 }
 const photo='assets/admin-card-amministrativa.webp';
 mkdirSync(join(folder,'assets'),{recursive:true});
 copyFileSync(join(source,photo),join(folder,photo));
 // The immutable Worker security policy must ALSO permit QA endpoint + frame-src blob:
 // do not deploy these assets until its CSP is reviewed and updated safely.
 return {files:[...writes.map(x=>x.path),photo],api:QA_ENDPOINT,workerCspRequired:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=process.argv[2];
 if(!dir)throw Error('Usage: node scripts/prepare-documents-qa.mjs <exported-QA-assets-dir>');
 console.log(JSON.stringify(prepareDocumentsQa(dir),null,2));
}
