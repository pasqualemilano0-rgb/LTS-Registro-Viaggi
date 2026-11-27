import {evaluateConateco,isConatecoRecent} from './conateco_rules.mjs?v=20261110-porti-freshcode-v2';
/** TFG location is ONLY the official "TERMINAL DI CONSEGNA" schedule column.
 * Never infer delivery location from booking text, notes, or acceptance flags. */
const UNAVAILABLE='LUOGO DA VERIFICARE';
const PLACEHOLDERS=new Set(['','S','N','SI','NO','YES','TRUE','FALSE','N/D','ND','N.A.','NA','N/A','-','—','NON INDICATO','NON DISPONIBILE','DA VERIFICARE','UNKNOWN','NULL','LUOGO NON PUBBLICATO']);
function basic(value) {
  if(typeof value!=='string')return '';
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g,' ')
    .replace(/\s+/g,' ').trim().toUpperCase().slice(0,100);
}
/** Preserve a safely validated official TERMINAL DI CONSEGNA column value. */
export function publishedDeliveryPlace(value){
  if(typeof value!=='string'||/[<>\u0000-\u001f\u007f]/.test(value))return null;
  const p=basic(value);
  if(PLACEHOLDERS.has(p)||p.length<3||p.length>80)return null;
  if(!/^[A-ZÀ-Ü0-9][A-ZÀ-Ü0-9 .,&()'/-]{2,79}$/u.test(p))return null;
  return p==='DRY PORT'?'DRYPORT':p;
}
/** A successful recent direct read verifies the currently published location.
 * Older publication timestamps alone do not make the official place outdated. */
export function tfgScheduleDelivery(row,feed,now=new Date()){
  const value=publishedDeliveryPlace(row?.destination);
  const metadata={terminal:'tfg',published:!!value,acquired_at:feed?.acquired_at??null,
    source_updated_at:feed?.source_updated_at??null};
  if(!value)return {...metadata,value:UNAVAILABLE,known:false,source:'TERMINAL DI CONSEGNA · PROGRAMMA TFG',
    note:'La colonna TERMINAL DI CONSEGNA è vuota o non leggibile. Controlla il programma ufficiale TFG.'};
  if(feed!==undefined){
    const acquired=Date.parse(feed?.acquired_at);
    const published=Date.parse(feed?.source_updated_at);
    const recentAcquisition=Number.isFinite(acquired)
      &&acquired<=now.getTime()+300000
      &&now.getTime()-acquired<=90*60000;
    const validPublication=Number.isFinite(published)&&published<=now.getTime()+300000;
    if(feed?.live!==true||feed?.live_failed===true||!recentAcquisition||!validPublication){
      return {...metadata,value,known:false,inferred:false,
        source:'TERMINAL DI CONSEGNA · LETTURA DIRETTA NON CONFERMATA',
        note:'Ultimo luogo pubblicato per questa nave/viaggio, NON confermato come attuale. La copia periodica non sostituisce una lettura diretta recente riuscita. Non verifica il singolo booking. Verifica il terminal ufficiale prima di partire.'};
    }
  }
  return {...metadata,value,known:true,source:'TERMINAL DI CONSEGNA · PROGRAMMA TFG',
    note:'Valore ufficiale della colonna TERMINAL DI CONSEGNA per questa nave/viaggio. Non verifica il singolo booking.'};
}
/** Read ONLY the Berth Forecast "accettazioneesterni" signal.
 * This is a vessel-level external-depot notice, never a delivery address,
 * booking authorization or proof that the depot is open right now. */
export function conatecoDepotAcceptance(row,feed,now=new Date()){
  const flag=basic(row?.external_depot);
  if(!row || row.source_conflict===true){
    return {kind:'unknown',value:'DA VERIFICARE',
      note:'Dati assenti o contraddittori. Controlla il Berth Forecast ufficiale.'};
  }
  const acquired=Date.parse(feed?.acquired_at);
  const fresh=isConatecoRecent(feed,now);
  // A stale negative signal is NOT evidence that no external depot accepts cargo now.
  if(!fresh){
    return {kind:'stale',value:flag==='S'?'SEGNALATA · DA RICONFERMARE':
      flag==='N'?'NON SEGNALATA · DA RICONFERMARE':'DA VERIFICARE · DATI VECCHI',
      note:'La segnalazione sui depositi esterni è stata acquisita troppo tempo fa. Non usare una vecchia assenza di segnalazione per dedurre INTERNO PORTO. Controlla il Berth Forecast e il Booking Export.'};
  }
  if(flag==='S'){
    return {kind:'reported',value:'OK',
      note:'CO.NA.TE.CO. segnala accettazione su depositi esterni per questa nave. Non indica quale deposito, se sia aperto adesso o se il singolo booking sia abilitato.'};
  }
  if(flag==='N'){
    return {kind:'not-reported',value:'NON SEGNALATA',
      note:'Il campo accettazioneesterni è N. Questo non dimostra che il booking debba essere consegnato all’interno del porto.'};
  }
  return {kind:'unknown',value:flag===''?'NON INDICATA':'DA VERIFICARE',
    note:'Il programma non fornisce una segnalazione di accettazione ai depositi esterni interpretabile. Non dedurre INTERNO PORTO dalla sua assenza.'};
}
/** Independent vessel-level signals; neither confirms a booking or a depot address. */
export function conatecoForecastDelivery(row,feed,now=new Date()){
  const verdict=evaluateConateco(row,feed,now);
  const depot=conatecoDepotAcceptance(row,feed,now);
  const internal={kind:verdict.kind,label:verdict.label,note:verdict.reason};
  const external={kind:depot.kind==='reported'?'good':depot.kind==='not-reported'?'warn':'unknown',
    label:depot.kind==='reported'?'ACCETTAZIONE SEGNALATA':depot.kind==='not-reported'?'NON SEGNALATA':'DA VERIFICARE',
    note:depot.note};
  return {terminal:'cnt',scope:'vessel',known:false,available:true,inferred:false,
    internal,external,acquired_at:feed?.acquired_at??null,source_updated_at:null,
    source:'CO.NA.TE.CO. · BERTH FORECAST',
    note:'Stati riferiti alla nave. Il deposito preciso, la sua apertura e il singolo booking devono essere verificati su Booking Export.'};
}
