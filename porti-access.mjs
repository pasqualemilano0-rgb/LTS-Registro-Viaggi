// LTS Porti/Booking: temporary maintenance gate for the migration.
// All driver journeys, accounts and administration remain available.
// No port-specific modules are imported and no booking requests are sent.
const BASE='/LTS-Registro-Viaggi/';
const title='Porti e booking temporaneamente sospesi';
const description='Stiamo completando la migrazione e i test di sicurezza. Il servizio Porti e booking non è al momento disponibile. Registro Viaggi e le altre funzioni LTS restano operative.';
const official=[
 ['CO.NA.TE.CO. · Booking Export','https://www.conateco.it/booking-export/'],
 ['CO.NA.TE.CO. · Berth Forecast','https://www.conateco.it/berth-forecast/'],
 ['TFG · Booking','https://tfg.bucci.it/@/TFGW_WW_BKK'],
 ['TFG · Programma navi','https://tfg.bucci.it/@/TFGW_TP_ETA'],
 ['SCT · Programma navi','https://www.salernocontainerterminal.com/vessel-schedule/']
];
function element(tag,attrs={},text=''){
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
 node.textContent=text;
 return node;
}
const main=element('main',{role:'status','aria-live':'polite',style:'max-width:650px;margin:10vh auto;padding:28px 22px;font:16px/1.55 system-ui,sans-serif;color:#ecf5ff;background:#122139;border:1px solid #2b3b52;border-radius:18px'});
main.append(
 element('h1',{style:'font-size:23px;line-height:1.25;margin:0 0 12px'},title),
 element('p',{},description),
 element('p',{},'Per verificare accettazione e orari prima di recarti al terminal, consulta direttamente i siti ufficiali.'),
 element('h2',{style:'font-size:16px;margin:24px 0 10px'},'Siti ufficiali')
);
const links=element('ul',{style:'padding-left:22px'});
for(const [name,url] of official){
 const item=element('li',{style:'margin:8px 0'});
 const link=element('a',{href:url,target:'_blank',rel:'noopener noreferrer',style:'color:#76e4d6'},name);
 item.append(link);links.append(item);
}
main.append(links);
const home=element('a',{href:BASE,target:'_top',style:'display:inline-block;margin-top:18px;color:#76e4d6;font-weight:700'},'Torna a LTS Registro Viaggi');
main.append(home);
document.body.replaceChildren(main);
document.body.hidden=false;
