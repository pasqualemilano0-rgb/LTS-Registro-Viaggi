/** Read-only provenance indicators for official public vessel schedules. */
export const PORT_SOURCE_FEEDS = Object.freeze([
  Object.freeze({
    id: 'cnt', label: 'CO.NA.TE.CO.', file: 'conateco.json',
    source: 'https://api.conateco.it/ConatecoServicesApi/BerthForecast',
    official: 'https://www.conateco.it/berth-forecast/'
  }),
  Object.freeze({
    id: 'tfg', label: 'TFG Napoli', file: 'tfg_schedule.json',
    source: 'https://tfg.bucci.it/@/TFGW_TP_ETA',
    official: 'https://tfg.bucci.it/@/TFGW_TP_ETA'
  }),
  Object.freeze({
    id: 'sct', label: 'SCT Salerno', file: 'sct.json',
    source: 'https://www.salernocontainerterminal.com/ca/an/vessel_schedule.php',
    official: 'https://www.salernocontainerterminal.com/vessel-schedule/'
  })
]);

const RECENT_COPY_MS = 90 * 60 * 1000;
const PREVIOUS_SOURCE_MS = 4 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 10 * 60 * 1000;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function instant(value, now) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + CLOCK_SKEW_MS) return null;
  return time;
}

export function describePortSource(snapshot, feed, now = Date.now()) {
  if (!feed || !PORT_SOURCE_FEEDS.some(item => item.id === feed.id && item.source === feed.source)) {
    throw new TypeError('Fonte portuale non riconosciuta.');
  }
  if (!Number.isFinite(now)) throw new TypeError('Orologio non disponibile.');
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      snapshot.source !== feed.source || !Array.isArray(snapshot.rows) ||
      snapshot.rows.length === 0) {
    return {state:'unknown', label:'Copia non verificabile', acquiredAt:null,
      sourceUpdatedAt:null, detail:'Controlla il sito ufficiale del terminal.'};
  }
  const acquired = instant(snapshot.acquired_at, now);
  if (acquired === null) {
    return {state:'unknown', label:'Data copia non valida', acquiredAt:null,
      sourceUpdatedAt:null, detail:'Controlla il sito ufficiale del terminal.'};
  }
  const hasSourceDate = snapshot.source_updated_at != null && snapshot.source_updated_at !== '';
  const sourceTime = hasSourceDate ? instant(snapshot.source_updated_at, now) : null;
  // A malformed claimed source timestamp is not silently labelled as fresh.
  if (hasSourceDate && sourceTime === null) {
    return {state:'unknown', label:'Data fonte non verificabile', acquiredAt:new Date(acquired).toISOString(),
      sourceUpdatedAt:null, detail:'La data dichiarata dalla fonte non è valida.'};
  }
  const acquiredAt = new Date(acquired).toISOString();
  const sourceUpdatedAt = sourceTime === null ? null : new Date(sourceTime).toISOString();
  if (now - acquired > RECENT_COPY_MS) {
    return {state:'outdated', label:'Copia datata', acquiredAt, sourceUpdatedAt,
      detail:'L’ultima acquisizione disponibile non è recente.'};
  }
  if (sourceTime !== null && now - sourceTime > PREVIOUS_SOURCE_MS) {
    return {state:'verify', label:'Fonte da verificare', acquiredAt, sourceUpdatedAt,
      detail:'La fonte dichiara un aggiornamento precedente alla copia.'};
  }
  return {state:'recent', label:'Copia recente', acquiredAt, sourceUpdatedAt,
    detail:sourceTime === null
      ? 'Il terminal non indica quando ha aggiornato il programma.'
      : 'Acquisizione recente; controlla comunque l’accettazione sul sito ufficiale.'};
}
