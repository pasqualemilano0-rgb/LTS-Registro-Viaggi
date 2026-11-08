/** LTS Admin smart console: pure, read-only selectors.
 * Never infer violations, wages, or unsynchronized journeys.
 */
const normalize=value=>String(value??'').normalize('NFD')
 .replace(/\p{M}/gu,'').toLocaleUpperCase('it-IT').replace(/\s+/gu,' ').trim();

function matchScore(query,text){
 const q=normalize(query),hay=normalize(text);
 if(!q||!hay)return -1;
 if(hay===q)return 0;
 if(hay.startsWith(q))return 1;
 if(hay.split(/[^\p{L}\p{N}]+/u).some(word=>word.startsWith(q)))return 2;
 return hay.includes(q)?3:-1;
}

export function searchSmartConsole({query='',drivers=[],customers=[],trips=[],limit=6}={}){
 const needle=normalize(query);
 if(!needle)return {drivers:[],customers:[],trips:[]};
 const cap=Math.min(12,Math.max(1,Number.isInteger(limit)?limit:6));
 const pick=(input,label,search,kind)=>{
  const result=[];
  for(const row of Array.isArray(input)?input:[]){
   if(!row||typeof row!=='object')continue;
   const name=String(label(row)||'').trim();
   if(!name)continue;
   const score=matchScore(needle,name);
   const secondary=matchScore(needle,search(row));
   if(score<0&&secondary<0)continue;
   const rank=score>=0?score:4+secondary;
   result.push({kind,row,rank,label:name});
  }
  result.sort((a,b)=>a.rank-b.rank||a.label.localeCompare(b.label,'it')||
   String(a.row.city||a.row.phone||'').localeCompare(String(b.row.city||b.row.phone||''),'it'));
  return result.slice(0,cap);
 };
 return {
  drivers:pick(drivers,d=>[d.firstName,d.lastName].filter(Boolean).join(' ')||'Autista',d=>d.phone,'driver'),
  customers:pick(customers,c=>c.name,c=>[c.city,c.address].join(' '),'customer'),
  trips:pick(trips,t=>t.container||t.client,t=>[t.client,t.city,t.driverName,t.date].join(' '),'trip')
 };
}

export function smartConsoleAlerts({drivers=[],report=null,customerStats=null}={}){
 const alerts=[];
 const known=Array.isArray(drivers)?drivers:[];
 const pending=known.filter(d=>['pending','invited','processing','expired'].includes(d.status)).length;
 if(pending)alerts.push({kind:'pending',count:pending,
  label:pending===1?'1 autista da attivare':'Autisti da attivare: '+pending});
 const missing=report?.summary?.missingTariffCount;
 if(Number.isSafeInteger(missing)&&missing>0)
  alerts.push({kind:'missing',count:missing,
   label:missing===1?'1 viaggio senza tariffa':'Viaggi senza tariffa: '+missing});
 const incomplete=report?.incompleteArchives;
 if(Number.isSafeInteger(incomplete)&&incomplete>0)
  alerts.push({kind:'incomplete',count:incomplete,
   label:'Archivi non leggibili: '+incomplete});
 const unpriced=customerStats?.unpriced;
 if(Number.isSafeInteger(unpriced)&&unpriced>0)
  alerts.push({kind:'unpriced',count:unpriced,
   label:unpriced===1?'1 sede senza tariffa':'Sedi senza tariffa: '+unpriced});
 return alerts;
}
