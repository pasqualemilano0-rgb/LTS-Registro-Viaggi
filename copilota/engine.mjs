/**
 * LTS Copilota v0.1 — deterministic, local-only intent suggestions.
 * NO network, database access, credentials, AI provider, or mutations.
 * All outputs are suggestions. A human must confirm every operation.
 */
const LIMIT=500;
const clean=value=>String(value??'').trim().slice(0,LIMIT);
const normalized=value=>clean(value).toLocaleLowerCase('it-IT');
export const CAPABILITIES=Object.freeze(['trip_draft','customer_request','tariff_help','port_info','support','help']);
export function interpret(message){
  const input=clean(message), q=normalized(message);
  if(!input)return {kind:'help',title:'Come posso aiutarti?',message:'Descrivi il viaggio, un cliente, una tariffa o una richiesta alla centrale.',requiresConfirmation:false};
  if(/(?:password|token|codice otp|codice mfa|pin segreto)/i.test(q))return {kind:'help',title:'Proteggi i tuoi dati',message:'Non inserire password, codici di accesso o token nella chat.',requiresConfirmation:false};
  if(/(?:viaggio|carico|scarico|container|consegna|ritiro)/i.test(q)){
    const container=q.match(/\b[a-z]{4}[ -]?\d{7}\b/i)?.[0]?.toUpperCase().replace(/ /g,'')??null;
    return {kind:'trip_draft',title:'Prepariamo il viaggio',message:'Posso aiutarti a compilare una bozza. Verifica cliente, data, origine, destinazione e container prima del salvataggio.',container,requiresConfirmation:true};
  }
  if(/(?:cliente|anagrafica|google maps)/i.test(q))return {kind:'customer_request',title:'Cliente da verificare',message:'Controlla prima i clienti esistenti. Per un nuovo cliente o una modifica aziendale serve approvazione della centrale.',requiresConfirmation:true};
  if(/(?:tariffa|prezzo|costo|compenso|extra)/i.test(q))return {kind:'tariff_help',title:'Tariffa da verificare',message:'Le tariffe devono provenire dal tariffario autorizzato. Non posso calcolare o inventare importi senza dati verificati.',requiresConfirmation:true};
  if(/(?:porto|terminal|booking|conateco|tfg|sct)/i.test(q))return {kind:'port_info',title:'Informazioni portuali',message:'Consulta la sezione Porti. Per accessi e appuntamenti fanno fede i sistemi ufficiali dei terminal.',requiresConfirmation:false};
  if(/(?:problema|errore|assistenza|centrale|segnala)/i.test(q))return {kind:'support',title:'Richiesta di assistenza',message:'Descrivi il problema. Posso aiutarti a preparare una segnalazione, ma non la invio automaticamente.',requiresConfirmation:true};
  return {kind:'help',title:'Sono qui per aiutarti',message:'Puoi chiedermi di preparare un viaggio, verificare un cliente, consultare le tariffe o trovare la sezione Porti.',requiresConfirmation:false};
}
