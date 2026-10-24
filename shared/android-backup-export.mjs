import { zipSync } from './vendor/fflate.mjs';
import { validateState } from './domain.mjs';

// The same logical format as Android BackupArchive. No SQL or filesystem paths.
const MAX_PAYLOAD = 32 * 1024 * 1024;
const MAX_CELLS = 1_200_000;
const MAX_ID = 9223372036854775806n;
const encoder = new TextEncoder();
const COLUMNS = {
  customers: ['_id', 'name', 'name_key', 'vat', 'city', 'address'],
  tariffs: ['_id', 'client', 'city', 'cents', 'customer_id'],
  extra_rates: ['service', 'cents'],
  trips: ['_id', 'date', 'city', 'container', 'client', 'facchinaggio', 'reefer', 'adr', 'pernotto', 'fare_cents', 'extra_facchinaggio', 'extra_reefer', 'extra_adr', 'extra_pernotto', 'second_city', 'second_client', 'second_fare_cents', 'sum_pickup_fares', 'facchinaggio_reefer', 'sabato_porto', 'sabato_trasferta', 'extra_facchinaggio_reefer', 'extra_sabato_porto', 'extra_sabato_trasferta', 'pre_orario', 'extra_pre_orario', 'note'],
};
const SERVICE_KEYS = ['facchinaggioBilico', 'reefer', 'adr', 'pernotto', 'facchinaggioReefer', 'sabatoPorto', 'sabatoTrasferta', 'preOrario'];

class Writer {
  constructor() { this.bytes = new Uint8Array(4096); this.offset = 0; this.view = new DataView(this.bytes.buffer); }
  require(size) {
    const length = this.offset + size;
    if (!Number.isSafeInteger(size) || size < 0 || length > MAX_PAYLOAD) throw new Error('Il backup Android supera il limite di 32 MB.');
    if (length > this.bytes.length) {
      const bytes = new Uint8Array(Math.min(MAX_PAYLOAD, Math.max(length, this.bytes.length * 2)));
      bytes.set(this.bytes); this.bytes = bytes; this.view = new DataView(bytes.buffer);
    }
  }
  byte(value) { this.require(1); this.view.setUint8(this.offset++, value); }
  int(value) { this.require(4); this.view.setInt32(this.offset, value, false); this.offset += 4; }
  long(value) { this.require(8); this.view.setBigInt64(this.offset, BigInt(value), false); this.offset += 8; }
  string(value) {
    const bytes = encoder.encode(value);
    if (bytes.length > 1024 * 1024) throw new Error('Un campo del backup Android è troppo lungo.');
    this.int(bytes.length); this.require(bytes.length); this.bytes.set(bytes, this.offset); this.offset += bytes.length;
  }
  cell(value) {
    if (value === null || value === undefined) this.byte(0);
    else if (typeof value === 'string') { this.byte(3); this.string(value); }
    else { this.byte(1); this.long(value); }
  }
  finish() { return this.bytes.slice(0, this.offset); }
}

/** Preserve native IDs where possible, map browser UUIDs without numeric collisions. */
function identifiers(rows) {
  const ids = new Map(), used = new Set();
  for (const row of rows) {
    if (!/^\d{1,19}$/u.test(row.id)) continue;
    const number = BigInt(row.id);
    if (number > 0n && number <= MAX_ID && !used.has(number)) { ids.set(row.id, number); used.add(number); }
  }
  let next = 1n;
  for (const row of rows) if (!ids.has(row.id)) {
    while (used.has(next)) next++;
    ids.set(row.id, next); used.add(next++);
  }
  return ids;
}

// Android orders same-day trips by numeric ID. Browser UUIDs carry no such
// ordering, so trip-only IDs are resequenced by creation order during transfer.
// Customer/tariff relationships never point to a trip ID.
function tripIdentifiers(rows) {
  const ordered = rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const time = a.row.createdAt.localeCompare(b.row.createdAt);
    if (time) return time;
    if (/^\d{1,19}$/u.test(a.row.id) && /^\d{1,19}$/u.test(b.row.id)) {
      const first = BigInt(a.row.id), second = BigInt(b.row.id);
      if (first !== second) return first < second ? -1 : 1;
    }
    return b.index - a.index;
  });
  return new Map(ordered.map(({ row }, index) => [row.id, BigInt(index + 1)]));
}

function checkedText(value, maximum, label) {
  if (value.length > maximum || value.includes('\0')) throw new Error(`${label}: per Android usa al massimo ${maximum} caratteri. Nessun dato è stato esportato.`);
  return value;
}

function exportTables(state) {
  const customerIds = identifiers(state.customers), tariffIds = identifiers(state.tariffs), tripIds = tripIdentifiers(state.trips);
  const customers = state.customers.map(row => {
    const name = checkedText(row.name, 500, `Cliente ${row.name}`);
    return [customerIds.get(row.id), name, name, checkedText(row.vat, 100, 'Partita IVA'), checkedText(row.city, 500, 'Località cliente'), checkedText(row.address, 1000, 'Indirizzo cliente')];
  });
  const tariffs = state.tariffs.map(row => [tariffIds.get(row.id), checkedText(row.client, 500, 'Cliente tariffa'), checkedText(row.city, 500, 'Località tariffa'), row.cents, row.customerId === null ? null : customerIds.get(row.customerId)]);
  // A missing global price must remain missing, otherwise restore could erase
  // historical prices. Android accepts an incomplete set of global extra rates.
  const extra_rates = SERVICE_KEYS.flatMap((key, index) => state.extraRates[key] === null ? [] : [[index, state.extraRates[key]]]);
  const trips = state.trips.map(row => {
    const selected = new Set(row.services);
    const flag = key => selected.has(key) ? 1 : 0;
    const amount = key => row.extraCents[key] ?? null;
    return [tripIds.get(row.id), row.date, checkedText(row.city, 500, 'Località viaggio'), checkedText(row.container, 500, 'Container'), checkedText(row.client, 500, 'Cliente viaggio'),
      flag('facchinaggioBilico'), flag('reefer'), flag('adr'), flag('pernotto'), row.fareCents,
      amount('facchinaggioBilico'), amount('reefer'), amount('adr'), amount('pernotto'),
      checkedText(row.secondCity, 500, 'Località seconda presa'), checkedText(row.secondClient, 500, 'Cliente seconda presa'), row.secondFareCents, row.sumPickupFares ? 1 : 0,
      flag('facchinaggioReefer'), flag('sabatoPorto'), flag('sabatoTrasferta'), amount('facchinaggioReefer'), amount('sabatoPorto'), amount('sabatoTrasferta'), flag('preOrario'), amount('preOrario'), checkedText(row.note, 2000, 'Nota viaggio')];
  });
  return { customers, tariffs, extra_rates, trips };
}

/** Full logical backup with notes, readable by LTS Android v11 and later. Does not change browser data. */
export async function exportAndroidBackup(input, { createdAt = Date.now(), remindersEnabled = false } = {}) {
  const state = validateState(input);
  if (!state.profile.firstName || !state.profile.lastName) throw new Error('Completa nome e cognome prima di esportare per Android.');
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || createdAt > 8640000000000000 || typeof remindersEnabled !== 'boolean') throw new Error('Opzioni backup Android non valide.');
  if (!globalThis.crypto?.subtle) throw new Error('Apri il sito tramite HTTPS per esportare il backup Android.');
  const tables = exportTables(state);
  let cells = 0;
  for (const [name, rows] of Object.entries(tables)) {
    cells += rows.length * COLUMNS[name].length;
    if (rows.length > 100000 || cells > MAX_CELLS) throw new Error('Troppi dati per un singolo backup Android.');
  }
  const out = new Writer();
  out.int(0x4c545342); out.int(1); out.int(12); out.string('it.lts.registro.nuovo'); out.long(createdAt);
  out.string(state.profile.firstName); out.string(state.profile.lastName); out.byte(remindersEnabled ? 1 : 0); out.int(4);
  for (const [name, rows] of Object.entries(tables)) {
    const columns = COLUMNS[name]; out.string(name); out.int(columns.length);
    for (const column of columns) out.string(column);
    out.int(rows.length); for (const row of rows) for (const value of row) out.cell(value);
  }
  const payload = out.finish();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const sha256 = Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
  const manifest = `LTS-BACKUP\nformat=1\ndatabase=12\napplication=it.lts.registro.nuovo\ncreated=${createdAt}\nsha256=${sha256}\npayloadBytes=${payload.length}\n`;
  return zipSync({ 'manifest.txt': encoder.encode(manifest), 'registro.bin': payload }, { level: 6 });
}
