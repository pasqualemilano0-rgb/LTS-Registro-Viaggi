import { unzipSync } from './vendor/fflate.mjs';
import { emptyState, validateState } from './domain.mjs';

export const MAX_ANDROID_BACKUP_BYTES = 32 * 1024 * 1024 + 128 * 1024;
const MAX_PAYLOAD = 32 * 1024 * 1024;
const MAX_CELL = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const APPLICATION = 'it.lts.registro.nuovo';
const SCHEMA = Object.freeze({
  customers: ['_id', 'name', 'name_key', 'vat', 'city', 'address'],
  tariffs: ['_id', 'client', 'city', 'cents', 'customer_id'],
  extra_rates: ['service', 'cents'],
  trips: ['_id', 'date', 'city', 'container', 'client', 'facchinaggio', 'reefer', 'adr', 'pernotto', 'fare_cents', 'extra_facchinaggio', 'extra_reefer', 'extra_adr', 'extra_pernotto', 'second_city', 'second_client', 'second_fare_cents', 'sum_pickup_fares', 'facchinaggio_reefer', 'sabato_porto', 'sabato_trasferta', 'extra_facchinaggio_reefer', 'extra_sabato_porto', 'extra_sabato_trasferta'],
});
const SERVICES = [
  ['facchinaggioBilico', 'facchinaggio', 'extra_facchinaggio'],
  ['reefer', 'reefer', 'extra_reefer'],
  ['adr', 'adr', 'extra_adr'],
  ['pernotto', 'pernotto', 'extra_pernotto'],
  ['facchinaggioReefer', 'facchinaggio_reefer', 'extra_facchinaggio_reefer'],
  ['sabatoPorto', 'sabato_porto', 'extra_sabato_porto'],
  ['sabatoTrasferta', 'sabato_trasferta', 'extra_sabato_trasferta'],
  ['preOrario', 'pre_orario', 'extra_pre_orario'],
];

function invalid(reason) { return new Error(`Backup Android non valido: ${reason}`); }
function text(bytes) { try { return decoder.decode(bytes); } catch { throw invalid('codifica del testo.'); } }
function sameColumns(actual, expected) { return actual.length === expected.length && new Set(actual).size === expected.length && actual.every(column => expected.includes(column)); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Inspect advertised lengths before allowing the DEFLATE library to allocate. */
function zipEntries(bytes) {
  if (bytes.length < 22 || bytes.length > MAX_ANDROID_BACKUP_BYTES) throw invalid('dimensione ZIP fuori limite.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  let end = -1;
  for (let offset = bytes.length - 22, minimum = Math.max(0, bytes.length - 65557); offset >= minimum; offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== 2 || u16(end + 10) !== 2) throw invalid('directory ZIP incompleta.');
  const centralOffset = u32(end + 16);
  if (centralOffset + u32(end + 12) !== end) throw invalid('directory ZIP incoerente.');
  let cursor = centralOffset;
  const entries = new Map();
  const localOffsets = new Set();
  for (let index = 0; index < 2; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw invalid('voce ZIP danneggiata.');
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const local = u32(cursor + 42), compressedSize = u32(cursor + 20), size = u32(cursor + 24);
    if (cursor + 46 + nameLength + extraLength + commentLength > end || u16(cursor + 34) !== 0 || local + 30 > centralOffset || flags & 1 || ![0, 8].includes(method)) throw invalid('formato ZIP non supportato.');
    const name = text(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!['manifest.txt', 'registro.bin'].includes(name) || entries.has(name) || localOffsets.has(local)) throw invalid('elementi ZIP sconosciuti o duplicati.');
    if (size > (name === 'manifest.txt' ? 4096 : MAX_PAYLOAD) || compressedSize > MAX_ANDROID_BACKUP_BYTES) throw invalid('elemento ZIP troppo grande.');
    if (u32(local) !== 0x04034b50 || u16(local + 8) !== method || u16(local + 6) !== flags || u16(local + 26) !== nameLength) throw invalid('intestazione ZIP incoerente.');
    const start = local + 30 + nameLength + u16(local + 28);
    if (start + compressedSize > centralOffset || text(bytes.subarray(local + 30, local + 30 + nameLength)) !== name) throw invalid('dati ZIP incompleti.');
    entries.set(name, { size, crc: u32(cursor + 16) });
    localOffsets.add(local);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) throw invalid('directory ZIP inattesa.');
  return entries;
}

class Reader {
  constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.offset = 0; }
  require(length) { if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) throw invalid('file troncato.'); }
  byte() { this.require(1); return this.view.getUint8(this.offset++); }
  int() { this.require(4); const number = this.view.getInt32(this.offset, false); this.offset += 4; return number; }
  long() { this.require(8); const number = this.view.getBigInt64(this.offset, false); this.offset += 8; return number; }
  string(maximum = MAX_CELL) { const length = this.int(); if (length > maximum) throw invalid('testo troppo lungo.'); this.require(length); const value = text(this.bytes.subarray(this.offset, this.offset + length)); this.offset += length; return value; }
  cell() {
    const type = this.byte();
    if (type === 0) return { type, value: null };
    if (type === 1) return { type, value: this.long() };
    if (type === 3) return { type, value: this.string() };
    // The current database has no FLOAT/BLOB fields. Reject them before mapping.
    throw invalid('tipo di campo non compatibile con il registro.');
  }
}

function sqlCell(table, column, cell, schemaVersion) {
  const nullableAmount = column === 'fare_cents' || column === 'second_fare_cents' || column.startsWith('extra_');
  if (cell.type === 0) {
    if (nullableAmount || column === 'customer_id') return null;
    throw invalid('campo obbligatorio mancante.');
  }
  const amount = nullableAmount || column === 'cents';
  const identifier = column === '_id' || column === 'customer_id';
  const integer = amount || identifier || column === 'service' || SERVICES.some(service => service[1] === column) || column === 'sum_pickup_fares';
  if (integer) {
    if (cell.type !== 1) throw invalid('campo numerico non valido.');
    const number = cell.value;
    if (identifier) {
      if (number <= 0n || number === 9223372036854775807n) throw invalid('identificativo fuori limite.');
      return String(number);
    }
    if (amount ? number < 0n || number > 99999999n : column === 'service' ? number < 0n || number > (schemaVersion >= 11 ? 7n : 6n) : number !== 0n && number !== 1n) throw invalid('importo o servizio fuori limite.');
    return Number(number);
  }
  if (cell.type !== 3) throw invalid('campo testuale non valido.');
  // Android v7 and the shared archive use the same semantic text limits.
  // The binary format, byte/count limits and older schema readers stay intact.
  let maximum = 500;
  if (column === 'address') maximum = 1000;
  if (column === 'vat') maximum = 100;
  if (column === 'note') maximum = 2000;
  const required = ['name', 'name_key', 'container', 'client'].includes(column) || (column === 'city' && table !== 'customers');
  if (cell.value.length > maximum || (required && !cell.value.trim()) || cell.value.includes('\0')) throw invalid('testo fuori limite.');
  return cell.value;
}

/** Decode only the bounded, integrity-checked logical format produced by LTS Android v3. */
export function decodeAndroidPayload(bytes, expectedCreated, expectedSchema) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PAYLOAD) throw invalid('contenuto troppo grande.');
  const reader = new Reader(bytes);
  if (reader.int() !== 0x4c545342 || reader.int() !== 1) throw invalid('app o versione non compatibile.');
  const schemaVersion = reader.int();
  if (![10, 11, 12].includes(schemaVersion) || (expectedSchema !== undefined && schemaVersion !== expectedSchema) || reader.string(256) !== APPLICATION) throw invalid('app o versione non compatibile.');
  const created = reader.long();
  if (created <= 0n || created > 8640000000000000n || String(created) !== expectedCreated) throw invalid('data del backup incoerente.');
  const firstName = reader.string(16384), lastName = reader.string(16384);
  if (reader.byte() > 1 || reader.int() !== 4) throw invalid('struttura non compatibile.');
  const tables = {};
  let totalCells = 0;
  for (let index = 0; index < 4; index++) {
    const name = reader.string(256), expected = name === 'trips' && schemaVersion >= 11 ? [...SCHEMA.trips, 'pre_orario', 'extra_pre_orario', ...(schemaVersion >= 12 ? ['note'] : [])] : SCHEMA[name], columnCount = reader.int();
    if (!Object.hasOwn(SCHEMA, name) || !expected || tables[name] || columnCount !== expected.length) throw invalid('tabella sconosciuta o duplicata.');
    const columns = Array.from({ length: columnCount }, () => reader.string(256));
    if (!sameColumns(columns, expected)) throw invalid('colonne non compatibili.');
    const rowCount = reader.int();
    totalCells += rowCount * columnCount;
    if (rowCount < 0 || rowCount > 100000 || totalCells > (schemaVersion === 12 ? 1200000 : schemaVersion === 11 ? 1100000 : 1000000)) throw invalid('troppe righe nel registro.');
    const rows = [], ids = new Set();
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = Object.fromEntries(columns.map(column => [column, sqlCell(name, column, reader.cell(), schemaVersion)]));
      if (name === 'trips' && schemaVersion === 10) Object.assign(row, { pre_orario: 0, extra_pre_orario: 0 });
      const id = name === 'extra_rates' ? row.service : row._id;
      if (ids.has(id)) throw invalid('identificativo duplicato.');
      ids.add(id);
      if (name === 'customers' && row.name_key !== row.name.trim().replace(/\s+/gu, ' ').toUpperCase()) throw invalid('indice del cliente non valido.');
      rows.push(row);
    }
    tables[name] = rows;
  }
  if (reader.offset !== bytes.length) throw invalid('contenuto aggiuntivo non previsto.');
  const state = emptyState();
  state.profile = { firstName, lastName };
  state.customers = tables.customers.map(row => ({ id: row._id, name: row.name, city: row.city, address: row.address, vat: row.vat }));
  state.tariffs = tables.tariffs.map(row => ({ id: row._id, customerId: row.customer_id, client: row.client, city: row.city, cents: row.cents }));
  for (const row of tables.extra_rates) state.extraRates[SERVICES[row.service][0]] = row.cents;
  state.trips = tables.trips.map(row => ({
    id: row._id, date: row.date, container: row.container, city: row.city, client: row.client,
    secondCity: row.second_city, secondClient: row.second_client, note: row.note ?? '',
    services: SERVICES.filter(service => row[service[1]] === 1).map(service => service[0]),
    fareCents: row.fare_cents, secondFareCents: row.second_fare_cents, sumPickupFares: row.sum_pickup_fares === 1,
    extraCents: Object.fromEntries(SERVICES.map(service => [service[0], row[service[2]]])),
    // Android does not record creation timestamps. IDs retain source ordering for ties.
    createdAt: `${row.date}T00:00:00.000Z`, updatedAt: `${row.date}T00:00:00.000Z`,
  }));
  return validateState(state);
}

/** Read a File, ArrayBuffer or Uint8Array. Nothing is committed by this function. */
export async function readAndroidBackup(input) {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (input.size > MAX_ANDROID_BACKUP_BYTES) throw invalid('file più grande di 32 MB.');
    input = new Uint8Array(await input.arrayBuffer());
  } else if (input instanceof ArrayBuffer) input = new Uint8Array(input);
  if (!(input instanceof Uint8Array)) throw invalid('seleziona un file ZIP LTS.');
  const entries = zipEntries(input);
  let contents;
  try { contents = unzipSync(input); } catch { throw invalid('decompressione non riuscita.'); }
  for (const [name, metadata] of entries) {
    if (!contents[name] || contents[name].length !== metadata.size || crc32(contents[name]) !== metadata.crc) throw invalid('integrità ZIP non verificata.');
  }
  const manifest = text(contents['manifest.txt']).split('\n');
  const payload = contents['registro.bin'];
  if (manifest.length !== 8 || manifest[0] !== 'LTS-BACKUP' || manifest[1] !== 'format=1' || !/^database=(10|11|12)$/u.test(manifest[2]) || manifest[3] !== `application=${APPLICATION}` || !/^created=\d+$/u.test(manifest[4]) || !/^sha256=[a-f0-9]{64}$/u.test(manifest[5]) || manifest[6] !== `payloadBytes=${payload.length}` || manifest[7] !== '') throw invalid('manifest non compatibile.');
  if (!globalThis.crypto?.subtle) throw new Error('Apri l’app tramite il suo indirizzo HTTPS per importare il backup.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const hex = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  if (manifest[5] !== `sha256=${hex}`) throw invalid('contenuto modificato o danneggiato.');
  return decodeAndroidPayload(payload, manifest[4].slice(8), Number(manifest[2].slice(9)));
}
