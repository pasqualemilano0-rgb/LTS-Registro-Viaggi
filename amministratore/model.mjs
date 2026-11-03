// Pure presentation logic, deliberately unaware of account tokens or archives.
export const STATUS_LABELS=Object.freeze({
 active:'Attivo',disabled:'Disattivato',resetting:'Ripristino in corso',
 pending:'Da invitare',invited:'Invito in attesa',processing:'Attivazione in corso',
 expired:'Invito scaduto',revoked:'Invito annullato',completed:'Attivato'
});
const PENDING=new Set(['pending','invited','processing','expired','revoked','completed']);
export function driverSummary(entries){
 const rows=Array.isArray(entries)?entries:[];
 return {total:rows.length,active:rows.filter(x=>x.status==='active').length,
  blocked:rows.filter(x=>x.status==='disabled'||x.status==='resetting').length,
  pending:rows.filter(x=>PENDING.has(x.status)).length};
}
export function filterDrivers(entries,query='',filter='all'){
 const q=String(query).trim().toLocaleLowerCase('it-IT');
 return (Array.isArray(entries)?entries:[]).filter(entry=>{
   const status=String(entry.status||'');
   if(filter==='active'&&status!=='active')return false;
   if(filter==='blocked'&&!['disabled','resetting'].includes(status))return false;
   if(filter==='pending'&&!PENDING.has(status))return false;
   const haystack=[entry.firstName,entry.lastName,entry.phone].filter(Boolean).join(' ').toLocaleLowerCase('it-IT');
   return !q||haystack.includes(q);
 });
}
