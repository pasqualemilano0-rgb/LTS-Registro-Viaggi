/** Conservative comparison for linked Google Maps address proposals.
 * Only an already-registered identical Maps URL + matching name and city
 * may become a reviewable street. Even those require admin approval.
 */
const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'')
 .toLocaleUpperCase('it-IT').trim().replace(/\s+/gu,' ');
const words=value=>normalize(value).replace(/[^A-Z0-9]/gu,'');
const city=value=>words(normalize(value).replace(/\s*(?:\([A-Z]{2}\)|\b[A-Z]{2})\s*$/u,''));
const placeholder=address=>/INDIRIZZO(?: STRADALE)? DA CONFERMARE|^DA CONFERMARE$/iu.test(String(address??''));
const street=/\b(?:VIA|VIALE|PIAZZA|PIAZZALE|CORSO|STRADA|LOCALIT[AÀ]|FRAZIONE|CONTRADA|ZONA INDUSTRIALE|LARGO|VICOLO|VIALETTO|STRADA STATALE|AREA INDUSTRIALE|S[SP]\s*\d+)\b/iu;
export const isMissingMapsAddress=site=>!String(site?.address??'').trim()||placeholder(site.address);
export function reviewLinkedMapsAddress(site,proposal){
 if(!isMissingMapsAddress(site))return {eligible:false,reason:'La sede ha già un indirizzo registrato.'};
 if(!site?.mapsUrl||site.mapsUrl!==proposal?.mapsUrl)return {eligible:false,reason:'Il link Maps non corrisponde al cliente.'};
 if(!words(site.name)||!words(proposal.name)||words(site.name)!==words(proposal.name))
  return {eligible:false,reason:'Il nome della sede recuperata non corrisponde: verifica manualmente.'};
 if(!city(site.city)||!city(proposal.city)||city(site.city)!==city(proposal.city))
  return {eligible:false,reason:'La località recuperata non corrisponde: verifica manualmente.'};
 const address=String(proposal.address??'').normalize('NFC').trim().replace(/\s+/gu,' ');
 if(address.length<8||address.length>1000||placeholder(address)||
    /\b(?:GOOGLE MAPS|CONFERMARE|HTTPS?:|PLACE[_ -]?ID)\b/iu.test(address)||
    !street.test(address))
  return {eligible:false,reason:'Google Maps non fornisce un indirizzo stradale sufficientemente preciso.'};
 return {eligible:true,address};
}
