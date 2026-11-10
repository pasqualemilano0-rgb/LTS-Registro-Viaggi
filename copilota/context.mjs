/**
 * Read-only adapter for an already-verified LTS driver session.
 * The host app passes a minimal snapshot, never tokens or entire account archives.
 * This module does not fetch, persist or mutate anything.
 */
const text=v=>String(v??'').trim();
const key=v=>text(v).normalize('NFC').toLocaleLowerCase('it-IT');
export function createCopilotContext({verified=false,driver=null,customers=[],tariffs=[],draft=null}={}){
 if(verified!==true)return Object.freeze({ready:false,driverName:'',customers:[],tariffs:[],draft:null});
 const safeCustomers=Array.isArray(customers)?customers.filter(c=>c&&typeof c==='object').slice(0,2000).map(c=>({name:text(c.name??c.client),city:text(c.city)})).filter(c=>c.name):[];
 const safeTariffs=Array.isArray(tariffs)?tariffs.filter(t=>t&&typeof t==='object'&&Number.isSafeInteger(t.cents)&&t.cents>=0).slice(0,2000).map(t=>({client:text(t.client),city:text(t.city),cents:t.cents})):[];
 const safeDraft=draft&&typeof draft==='object'?{client:text(draft.client),city:text(draft.city),container:text(draft.container),date:text(draft.date)}:null;
 return Object.freeze({ready:true,driverName:text(driver?.firstName),customers:safeCustomers,tariffs:safeTariffs,draft:safeDraft});
}
export function suggestFromContext(context,{client='',city=''}={}){
 if(!context?.ready)return {status:'locked',message:'Accedi e verifica la sessione LTS per utilizzare i dati aziendali.'};
 const name=text(client||context.draft?.client),place=text(city||context.draft?.city);
 if(!name)return {status:'missing_client',message:'Seleziona il cliente per completare la bozza.'};
 const matches=context.customers.filter(c=>key(c.name)===key(name));
 if(matches.length===0)return {status:'approval_required',client:name,message:'Cliente non presente nei dati disponibili: richiedi la verifica alla centrale.'};
 if(!place)return {status:'missing_destination',client:name,message:'Indica la destinazione per verificare la tariffa.'};
 const rate=context.tariffs.find(t=>key(t.client)===key(name)&&key(t.city)===key(place));
 if(!rate)return {status:'tariff_pending',client:name,city:place,message:'Cliente riconosciuto. Nessuna tariffa autorizzata trovata per questa destinazione.'};
 return {status:'ready_for_review',client:name,city:place,tariffCents:rate.cents,message:'Cliente e tariffa individuati nei dati disponibili. Controlla la bozza prima di confermare.'};
}
