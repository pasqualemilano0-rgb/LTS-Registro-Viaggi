/** Personal-customer safety helpers. Shared company rows are never mutable here. */
export function restoreDeletedPersonalCustomer(state,record,removedTariffs=[]){
 if(!state||!Array.isArray(state.customers)||!record||typeof record!=='object'||
  typeof record.id!=='string'||!record.id.trim())throw new Error('Cliente da ripristinare non valido.');
 if(state.customers.some(c=>c.id===record.id))throw new Error('Cliente già presente: ripristino non necessario.');
 if(state.customers.some(c=>c.name===record.name))
  throw new Error('Esiste già un cliente con questo nome. Controlla la rubrica prima di ripristinare.');
 const currentTariffs=Array.isArray(state.tariffs)?state.tariffs:[];
 const restored=(Array.isArray(removedTariffs)?removedTariffs:[]).filter(t=>
  !currentTariffs.some(current=>current.id===t.id));
 return {...state,customers:[...state.customers,{...record}],tariffs:[...currentTariffs,...restored]};
}
/** Non-destructive CSV preview; only filled values count as changes. */
export function customerCsvChanges(customers,rows,{limit=12}={}){
 const existing=new Map((Array.isArray(customers)?customers:[]).map(c=>[c.name,c]));
 const changes=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const old=existing.get(row.name);
  if(!old){changes.push({name:row.name,kind:'new',fields:[]});continue;}
  const fields=['vat','city','address','phone'].filter(k=>row[k]&&row[k]!==old[k]);
  if(fields.length)changes.push({name:row.name,kind:'update',fields});
 }
 return {total:changes.length,shown:changes.slice(0,limit)};
}
