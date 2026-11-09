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
const collator=new Intl.Collator('it-IT',{sensitivity:'base',numeric:true});
const searchable=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleLowerCase('it-IT').replace(/\s+/gu,' ').trim();
export function driverInitial(entry){
 const name=String(entry?.lastName||entry?.firstName||'').normalize('NFD')
  .replace(/\p{M}/gu,'').trim().toLocaleUpperCase('it-IT');
 const first=name[0]||'';
 return /^[A-Z]$/u.test(first)?first:'#';
}
export function filterDrivers(entries,query='',filter='all',initial=''){
 const q=searchable(query),letter=String(initial).toLocaleUpperCase('it-IT');
 return (Array.isArray(entries)?entries:[]).filter(entry=>{
   const status=String(entry.status||'');
   if(filter==='active'&&status!=='active')return false;
   if(filter==='blocked'&&!['disabled','resetting'].includes(status))return false;
   if(filter==='pending'&&!PENDING.has(status))return false;
   if(letter&&driverInitial(entry)!==letter)return false;
   const first=entry.firstName||'',last=entry.lastName||'',phone=entry.phone||'';
   const haystack=searchable([first,last,phone,last+' '+first].join(' '));
   return !q||haystack.includes(q);
 }).sort((a,b)=>
   collator.compare(String(a.lastName||a.firstName||''),String(b.lastName||b.firstName||''))||
   collator.compare(String(a.firstName||''),String(b.firstName||''))||
   collator.compare(String(a.phone||''),String(b.phone||'')));
}
