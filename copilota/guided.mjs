import {createCopilotContext,suggestFromContext} from './context.mjs';
import {searchCustomers,validContainer,normalizeContainer,prepareTripReview,prepareCustomerRequest} from './flow.mjs';

/** Pure guided workflow. Caller must supply only records already authorized by LTS. */
export function createGuidedSession(snapshot){
 const context=createCopilotContext(snapshot);
 return {ready:context.ready,context,actions:context.ready?['trip','customers','rates','ports']:['ports']};
}
export function guidedCustomerSearch(session,query){
 if(!session?.ready)return {status:'locked',results:[]};
 return {status:'ok',results:searchCustomers(session.context.customers,query)};
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
