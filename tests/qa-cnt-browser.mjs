import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const pw=createRequire(import.meta.url)((process.env.LTS_BROWSER_PLAYWRIGHT||'/tmp/lts-browser-test')+'/node_modules/playwright');
const engine=process.env.LTS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const base='/LTS-Registro-Viaggi/';
const now='2026-11-27T08:00:00Z';
const cases=[];
for(const [internal,flag,icon] of [['good','1','ACCETTA_CARICO'],['bad','0','NO_ACCETTA_CARICO'],['unknown','','']])
 for(const [external,depot] of [['good','S'],['warn','N'],['unknown','']]){
  cases.push({internal,external,row:{vessel:'QA CNT '+internal+' '+external,voyage:String(cases.length+1),category:'PREVISTE',vessel_status:'PRE',acceptance_flag:flag,acceptance_icon:icon,external_depot:depot,stop_cargo:'NO',opening:'2026-11-27 07:00',closing:'2026-11-28 18:00',eta:'2026-11-28 00:00'}});
 }
const feed={source:'https://api.conateco.it/ConatecoServicesApi/BerthForecast',acquired_at:now,rows:cases.map(c=>c.row)};
const parent='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:100vh;border:0;display:block}</style><script>addEventListener("message",e=>{if(e.origin===location.origin&&e.source===document.querySelector("iframe").contentWindow&&e.data?.type==="lts-porti-ready")e.source.postMessage({type:"lts-porti-authorized"},location.origin)})</script><iframe src="'+base+'porti/index.html"></iframe>';
const server=createServer(async(req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p===base)return res.writeHead(200,{'Content-Type':'text/html'}).end(parent);
 if(p===base+'porti/data/conateco.json')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(feed));
 if(!p.startsWith(base))return res.writeHead(404).end();
 const file=resolve(root,decodeURIComponent(p.slice(base.length)));
 if(!file.startsWith(root+sep))return res.writeHead(403).end();
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
 try{res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(await readFile(file));}catch{res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await pw[engine].launch(engine==='chromium'?{headless:true,args:['--no-sandbox']}:{headless:true});
 const origin='http://127.0.0.1:'+server.address().port;
 await mkdir('browser-evidence',{recursive:true});
 for(const width of [320,360,390]){
  const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await ctx.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(origin+base);
  const frame=page.frameLocator('iframe');
  const filter=frame.locator('#cnt-ship-filter');
  // Open the existing advanced section if the driver UI collapsed it.
  await filter.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await filter.waitFor({state:'visible'});
  for(const c of cases){
   await filter.fill(c.row.vessel);
   const button=frame.locator('#cnt-vessel-list button[data-cnt-row]');
   await button.waitFor({state:'visible'});
   assert.equal(await button.count(),1);
   const compact=button.locator('.cnt-acceptance-item');
   assert.deepEqual(await compact.evaluateAll(nodes=>nodes.map(n=>n.dataset.state)),[c.internal,c.external]);
   await button.click();
   const panel=frame.locator('.cnt-acceptance-grid');
   await panel.waitFor({state:'visible'});
   const items=panel.locator('.cnt-acceptance-item');
   assert.equal(await items.count(),2);
   assert.deepEqual(await items.evaluateAll(nodes=>nodes.map(n=>n.dataset.state)),[c.internal,c.external]);
   assert.deepEqual(await items.locator('.cnt-acceptance-title').allTextContents(),['INTERNO PORTO','DRYPORT / DEPOSITI ESTERNI']);
   assert.equal(await frame.locator('.depot-acceptance-panel:visible').count(),0);
   assert.equal(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1&&[...n.querySelectorAll('.cnt-acceptance-item')].every(x=>x.scrollWidth<=x.clientWidth+1)),true);
   assert.equal(await panel.evaluate(n=>n.ownerDocument.documentElement.scrollWidth<=n.ownerDocument.documentElement.clientWidth+1),true);
   await panel.screenshot({path:'browser-evidence/cnt-'+engine+'-'+width+'-'+c.internal+'-'+c.external+'.png'});
  }
  assert.deepEqual(errors,[]);
  await ctx.close();
  console.log('PASS CNT '+engine+' '+width+'px: nine real fleet/detail states, no duplicate panels or horizontal overflow; screenshots saved');
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
