/** Cost-free recovery from an already approved shared LTS Maps customer.
 * Does not call Google, geocoding, network APIs or change any stored data.
 */
const normalize=value=>String(value??'').normalize('NFC').trim()
 .replace(/\s+/gu,' ').toLocaleUpperCase('it-IT');
const nameKey=value=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'');
const postcode=value=>/\b\d{5}\b/u.exec(value||'')?.[0]||'';

export function approvedLocalityFromSharedMaps(customers,proposal){
 if(!proposal||normalize(proposal.city)||!proposal.mapsUrl)return null;
 const matches=(Array.isArray(customers)?customers:[]).filter(row=>
  row?.mapsUrl===proposal.mapsUrl&&nameKey(row.name)===nameKey(proposal.name)&&
  (!postcode(proposal.address)||postcode(row.address)===postcode(proposal.address))&&
  /^[\p{L}][\p{L}\p{M} .’'\-]{1,99}$/u.test(normalize(row.city)));
 if(matches.length!==1)return null;
 const verified=matches[0];
 return {...proposal,city:normalize(verified.city),
  address:normalize(verified.address)||proposal.address,
  warnings:[...(proposal.warnings||[]),
   'Località recuperata dalla sede già verificata nell’elenco condiviso LTS.']};
}
