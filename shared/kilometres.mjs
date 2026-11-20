/** Weekly distances, never instrument readings. Rome dates; month belongs to Friday. */
export const KILOMETRES_MONTH_RULE='Ogni settimana è attribuita interamente al mese del venerdì, una sola volta.';
export function romeDate(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=k=>parts.find(p=>p.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function datePlus(date,days) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Data non valida.');
 const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)throw Error('Data non valida.');
 d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function weekStart(date=romeDate()) {const day=new Date(datePlus(date,0)+'T12:00:00Z').getUTCDay();return datePlus(date,-((day+6)%7));}
export function weekMonth(monday) {if(weekStart(monday)!==monday)throw Error('La settimana deve iniziare di lunedì.');return datePlus(monday,4).slice(0,7);}
export function validKilometres(value) {return Number.isSafeInteger(value)&&value>=0&&value<=20000;}
export function monthlyKilometres(rows,month) {
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mese non valido.');
 const seen=new Set();return rows.filter(row=>weekMonth(row.weekStart)===month).sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map(row=>{
  if(seen.has(row.weekStart)||!validKilometres(row.km))throw Error('Rilevazioni CHILOMETRI non valide.');seen.add(row.weekStart);return row;
 });
}
export function kilometresTotal(rows,month) {return monthlyKilometres(rows,month).reduce((n,r)=>n+r.km,0);}
export function weekLabel(monday) {const short=d=>d.slice(8,10)+'/'+d.slice(5,7);return short(monday)+' – '+short(datePlus(monday,6));}
