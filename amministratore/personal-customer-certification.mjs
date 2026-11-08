/** Safe personal -> shared Google Maps certification decisions.
 * Pure UI preflight only. The protected Maps and archive services authorize
 * writes and perform server-side duplicate checks and revision-CAS deletions.
 * Never equate two warehouses just because company and city match.
 */
import {normalizedStreetKey} from '../shared/customer-site-matches.mjs';

const normal=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleUpperCase('it-IT').trim();
const simple=value=>normal(value).replace(/[^A-Z0-9]/gu,'');
const nameKey=site=>simple(site?.name);
const cityKey=site=>simple(normal(site?.city).replace(/\s*\([A-Z]{2}\)\s*$/u,''));
const hasRealAddress=site=>Boolean(normalizedStreetKey(site?.address));
const genericPath=/^\/maps\/?(?:search\/?)?$/iu;
const tracking=/^(?:g_st|utm_.+|fbclid|hl|entry)$/iu;

function exactMapsLink(a,b){
 if(!a?.mapsUrl||!b?.mapsUrl)return false;
 try{
  const first=new URL(a.mapsUrl),second=new URL(b.mapsUrl);
  if(first.origin!==second.origin||first.pathname!==second.pathname)return false;
  const params=u=>[...u.searchParams.entries()]
   .filter(([key])=>!tracking.test(key))
   .sort(([k1,v1],[k2,v2])=>k1.localeCompare(k2)||v1.localeCompare(v2));
  const x=params(first),y=params(second);
  if(genericPath.test(first.pathname)&&!x.length)return false;
  return JSON.stringify(x)===JSON.stringify(y);
 }catch{return false;}
}
function sameCompanyAndCity(a,b){
 return Boolean(nameKey(a)&&cityKey(a)&&nameKey(a)===nameKey(b)&&cityKey(a)===cityKey(b));
}
function strongSharedMatch(shared,proposal){
 if(!sameCompanyAndCity(shared,proposal))return false;
 const streetA=normalizedStreetKey(shared.address),streetB=normalizedStreetKey(proposal.address);
 return Boolean(streetA&&streetB&&streetA===streetB)||exactMapsLink(shared,proposal);
}
/** Review is read-only; no deletion without a successfully saved shared record. */
export function reviewPersonalCustomerCertification(personal,proposal,shared,personalRows=[]){
 if(!personal?.id||!personal?.name||!personal?.city)
  return {mode:'blocked',reason:'Il cliente personale deve avere nome e località prima di essere certificato.'};
 if(!proposal?.name?.trim()||!proposal?.city?.trim()||
    !proposal?.address?.trim()||!proposal?.mapsUrl?.trim()||!hasRealAddress(proposal))
  return {mode:'blocked',reason:'La scheda Google Maps non contiene un indirizzo verificabile. Nessun cliente sarà eliminato.'};
 if(!sameCompanyAndCity(personal,proposal))
  return {mode:'blocked',reason:'Nome o località di Google Maps non corrispondono al cliente personale. Controlla la sede e correggi prima il cliente.'};
 const street=normalizedStreetKey(personal.address);
 if(street&&street!==normalizedStreetKey(proposal.address))
  return {mode:'blocked',reason:'L’indirizzo personale è diverso da Google Maps. Verifica e correggi il cliente prima di unificarlo.'};
 const samePersonal=(Array.isArray(personalRows)?personalRows:[]).filter(row=>
  row?.id!==personal.id&&sameCompanyAndCity(personal,row)&&
  (!street||!normalizedStreetKey(row.address)||normalizedStreetKey(row.address)===street));
 if(samePersonal.length)
  return {mode:'blocked',reason:'Esistono più clienti personali potenzialmente riferiti a questa sede. Verifica i duplicati prima di procedere.'};
 const entries=Array.isArray(shared)?shared:[];
 const matches=entries.filter(site=>strongSharedMatch(site,proposal));
 if(matches.length>1)
  return {mode:'blocked',reason:'Più sedi condivise risultano equivalenti. Verifica i duplicati nella rubrica aziendale.'};
 if(matches.length===1)return {mode:'existing',site:matches[0]};
 const nearby=entries.filter(site=>sameCompanyAndCity(site,proposal));
 if(nearby.some(site=>!hasRealAddress(site)))
  return {mode:'blocked',reason:'Esiste già un cliente condiviso con lo stesso nome e località ma senza indirizzo verificabile. Completa prima la sua sede.'};
 if(nearby.length&&!street)
  return {mode:'blocked',reason:'Sono presenti altre sedi condivise con lo stesso nome e località. Inserisci l’indirizzo personale per identificare con certezza il deposito.'};
 return {mode:'new'};
}
