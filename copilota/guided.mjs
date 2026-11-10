import {createCopilotContext,suggestFromContext} from './context.mjs';
import {searchCustomers,validContainer,normalizeContainer,prepareTripReview,prepareCustomerRequest} from './flow.mjs';

/** Pure guided workflow. Caller must supply only records already authorized by LTS. */
export function createGuidedSession(snapshot){
 const context=createCopilotContext(snapshot);
 return {ready:context.ready,context,actions:context.ready?['trip','customers','rates','ports']:['ports']};
}
export function guidedCustomerSearch(session,query){
 if(!session?.ready)return {status:'locked',results:[]};
 return {status:'ok',results:smartCustomerSearch(session.context.customers,query)};
}
export function guidedTripDecision(session,{container,customer,city}={}){
 if(!session?.ready)return {status:'locked',message:'Sessione LTS non verificata.'};
 if(!validContainer(container))return {status:'invalid_container',message:'Inserisci un container di 4 lettere e 7 cifre.'};
 const name=String(customer??'').trim();
 if(!name)return {status:'choose_customer',message:'Cerca e seleziona il cliente.'};
 const known=session.context.customers.filter(c=>c.name.toLocaleLowerCase('it-IT')===name.toLocaleLowerCase('it-IT'));
 if(!known.length)return {status:'approval_required',proposal:prepareCustomerRequest({container,customerName:name}),message:'Cliente assente: prepara una richiesta alla centrale.'};
 const destination=String(city??'').trim();
 if(known.length>1&&!destination)return {status:'choose_destination',options:known.map(c=>c.city),message:'Seleziona la sede del cliente.'};
 const selected=destination?known.find(c=>c.city.toLocaleLowerCase('it-IT')===destination.toLocaleLowerCase('it-IT')):known[0];
 if(!selected)return {status:'choose_destination',options:known.map(c=>c.city),message:'Seleziona una sede autorizzata.'};
 const draft=prepareTripReview({container:normalizeContainer(container),customer:selected});
 const rate=suggestFromContext(session.context,{client:selected.name,city:selected.city});
 return {status:rate.status,draft,rate:rate.status==='ready_for_review'?{cents:rate.tariffCents}:null,message:rate.message};
}

/** Local, deterministic ranking; no customer is fabricated or submitted. */
const clean=value=>String(value??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
 .toLocaleLowerCase('it-IT').replace(/[^a-z0-9]+/g,' ').trim();
const distance=(a,b)=>{
 const previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let diagonal=previous[0];previous[0]=i;
  for(let j=1;j<=b.length;j++){
   const old=previous[j];
   previous[j]=Math.min(previous[j]+1,previous[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));
   diagonal=old;
  }
 }
 return previous[b.length];
};
export function smartCustomerSearch(choices,query,limit=12){
 const needle=clean(query);
 if(needle.length<2)return searchCustomers(choices,query);
 const exact=searchCustomers(choices,query);
 if(exact.length>=limit)return exact.slice(0,limit);
 const terms=needle.split(' ');
 const candidates=[];
 for(const row of Array.isArray(choices)?choices:[]){
  if(exact.includes(row))continue;
  const name=clean(row?.name),city=clean(row?.city);
  if(!name)continue;
  const words=name.split(' ');
  const fuzzy=terms.every(term=>words.some(word=>word.includes(term)||term.length>=4&&distance(word,term)<=Math.min(2,Math.floor(term.length/4))));
  const cityMatch=city.includes(needle);
  if(fuzzy||cityMatch)candidates.push({row,score:fuzzy?0:1});
 }
 candidates.sort((a,b)=>a.score-b.score||a.row.name.localeCompare(b.row.name,'it'));
 return [...exact,...candidates.map(x=>x.row)].slice(0,limit);
}
/** Extract supported intent only. Unknown requests never trigger actions. */
export function interpretGuidedMessage(value){
 const text=String(value??'').trim().slice(0,240);
 const container=text.toUpperCase().match(/\\b[A-Z]{4}\\s?\\d{7}\\b/)?.[0]?.replace(/\\s/g,'')||null;
 const customer=text.replace(/^(?:inserisci|aggiungi|crea|registra)\\s+(?:un\\s+)?viaggio\\s*(?:per|cliente|di)?\\s*/i,'')
  .replace(/^(?:cerca|trova|cliente|localita|località)\\s*(?:cliente|di|per)?\\s*/i,'')
  .replace(/\\b[A-Z]{4}\\s?\\d{7}\\b/gi,'').trim();
 const trip=/^(?:inserisci|aggiungi|crea|registra)\\s+(?:un\\s+)?viaggio\\b/i.test(text);
 return {intent:trip?'trip':'customer_search',customer,container};
}
