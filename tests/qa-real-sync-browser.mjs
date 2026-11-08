/** LTS RC3 QA: two Chromium sessions exercise the real REST/CAS client contract
 * with an in-process synthetic server. A live authenticated QA login is separate.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const playwrightRoot=process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test';
const {chromium}=createRequire(import.meta.url)(playwrightRoot+'/node_modules/playwright');
const prefix='/LTS-Registro-Viaggi/';
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'synthetic@example.test'};
let remote=null,writes=0;
const allowed=new Set(['.html','.mjs','.css','.js']);
const site=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
 const path=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'qa-sync.html');
 if(!path.startsWith(root+sep)||!allowed.has(extname(path))){res.writeHead(403).end();return;}
 try{res.writeHead(200,{'Content-Type':extname(path)==='.html'?'text/html; charset=utf-8':
  extname(path)==='.css'?'text/css; charset=utf-8':'text/javascript; charset=utf-8'})
  .end(await readFile(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({serviceWorkers:'block'});
 const illegal=[];
 ctx.on('request',req=>{
  const url=new URL(req.url());
  if(url.origin!=='https://sywxretbfgwxwhvdcknq.supabase.co'&&
    url.origin!=='http://127.0.0.1:'+site.address().port)illegal.push(url.origin);
 });
 await ctx.route('https://sywxretbfgwxwhvdcknq.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  const cors={'Access-Control-Allow-Origin':'*',
   'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
   'Access-Control-Allow-Headers':'apikey,authorization,content-type,prefer',
   'Content-Type':'application/json'};
  const send=(body,status=200)=>route.fulfill({status,headers:cors,
   body:JSON.stringify(body)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''});
  if(url.pathname==='/auth/v1/token')return send({
   access_token:'QA_SYNTHETIC_SESSION_TOKEN',token_type:'bearer',expires_in:3600,user
  });
  if(url.pathname==='/auth/v1/user')return send(user);
  if(url.pathname==='/auth/v1/signup')return send({user});
  if(url.pathname==='/rest/v1/lts_rc3_sandbox_register'){
   if(method==='GET')return send(remote?[remote]:[]);
   if(method==='POST'){
    if(!remote)remote={owner_id:user.id,revision:0,
     payload:{trips:[],customers:[],tariffs:[],extraRates:{}},last_request_id:null};
    return send(null,201);
   }
   if(method==='PATCH'){
    const data=JSON.parse(req.postData()||'{}');
    const expected=Number((url.searchParams.get('revision')||'').replace(/^eq[.]/,''));
    if(!remote||remote.revision!==expected)return send([]);
    remote={...remote,...data};
    writes++;
    return send([remote]);
   }
  }
  return send({message:'Unsupported QA test route'},404);
 });
 const base='http://127.0.0.1:'+site.address().port+prefix+'qa-sync.html';
 async function openSession(){
  const page=await ctx.newPage();
  const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#qa-email').fill('synthetic@example.test');
  await page.locator('#qa-password').fill('not-a-real-secret-123');
  await page.locator('#login-button').click();
  await page.locator('#workspace').waitFor({state:'visible',timeout:15000});
  assert.deepEqual(jsErrors,[]);
  return page;
 }
 const a=await openSession(),b=await openSession();
 assert.equal(remote?.revision,0);
 await a.locator('#container').fill('QA1111111');
 await a.locator('#add-button').click();
 await a.waitForFunction(()=>document.querySelector('#count').textContent==='1');
 await a.locator('#save-button').click();
 await a.waitForFunction(()=>document.querySelector('#revision').textContent==='1');
 assert.equal(remote.revision,1);
 assert.equal(remote.payload.trips.length,1);
 await b.locator('#refresh-button').click();
 await b.waitForFunction(()=>document.querySelector('#count').textContent==='1');
 await b.locator('#container').fill('QA2222222');
 await b.locator('#add-button').click();
 await b.waitForFunction(()=>document.querySelector('#count').textContent==='2');
 await a.locator('#container').fill('QA3333333');
 await a.locator('#add-button').click();
 await a.locator('#save-button').click();
 await a.waitForFunction(()=>document.querySelector('#revision').textContent==='2');
 assert.equal(remote.revision,2);
 assert.equal(remote.payload.trips.length,2);
 await b.locator('#save-button').click();
 await b.waitForFunction(()=>document.querySelector('#status').textContent.includes('Conflitto di revisione'));
 assert.equal(remote.revision,2,'Stale device must not overwrite current revision');
 assert.equal(remote.payload.trips.some(t=>t.container==='QA2222222'),false);
 assert.equal(await b.locator('#trip-list').textContent().then(t=>t.includes('QA2222222')),true,
  'Conflicted draft must remain visible on the second device');
 const c=await openSession();
 assert.equal(await c.locator('#count').textContent(),'2',
  'Second session must read both committed remote test journeys');
 assert.equal(writes,2);
 assert.deepEqual(illegal,[]);
 await ctx.close();
 console.log('PASS QA real-server client: multi-session read, 2 atomic writes, stale-revision conflict, retained local draft');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>site.close(resolve));
}
