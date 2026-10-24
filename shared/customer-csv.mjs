import { normalizeText, validateState } from './domain.mjs';

export const MAX_CUSTOMER_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CUSTOMER_CSV_ROWS = 10000;
const HEADER = ['CLIENTE', 'PARTITA IVA', 'CITTÀ', 'INDIRIZZO'];

/** Quoted cells, embedded newlines and both common Italian CSV separators. */
function parseRows(source, separator) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let index = 0; index <= source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === undefined) throw new Error('CSV: virgolette non chiuse.');
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === separator || char === '\n' || char === '\r' || char === undefined) {
      row.push(cell); cell = ''; closed = false;
      if (row.length > 4) throw new Error(`CSV: troppe colonne alla riga ${rows.length + 1}.`);
      if (char !== separator) {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (rows.length > MAX_CUSTOMER_CSV_ROWS + 1) throw new Error('CSV: massimo 10.000 clienti per importazione.');
        if (char === '\r' && source[index + 1] === '\n') index++;
      }
    } else if (char === '"') {
      if (cell || closed) throw new Error(`CSV: virgolette non valide alla riga ${rows.length + 1}.`);
      quoted = true;
    } else {
      if (closed && char.trim()) throw new Error(`CSV: testo dopo le virgolette alla riga ${rows.length + 1}.`);
      if (!closed) cell += char;
    }
    if (cell.length > 4000) throw new Error('CSV: campo troppo lungo.');
  }
  return rows;
}

export function parseCustomerCsv(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > MAX_CUSTOMER_CSV_BYTES) throw new Error('Il CSV deve essere UTF-8 e non superare 2 MB.');
  const text = source.replace(/^\uFEFF/u, '');
  let rows;
  for (const delimiter of [';', ',']) {
    try {
      const candidate = parseRows(text, delimiter);
      if (candidate[0]?.length === 4 && candidate[0].map(normalizeText).every((value, index) => value === HEADER[index] || (index === 2 && value === 'CITTA'))) { rows = candidate; break; }
    } catch (error) { if (delimiter === ',') throw error; }
  }
  if (!rows) throw new Error('Intestazione CSV richiesta: CLIENTE;PARTITA IVA;CITTÀ;INDIRIZZO.');
  if (rows.length < 2) throw new Error('Il CSV non contiene clienti.');
  return rows.slice(1).map((row, index) => {
    if (row.length !== 4) throw new Error(`CSV: servono 4 colonne alla riga ${index + 2}.`);
    const [name, vat, city, address] = row.map(normalizeText);
    if (!name || name.length > 500 || vat.length > 100 || city.length > 500 || address.length > 1000 || row.some(value => /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))) throw new Error(`CSV: dati cliente non validi alla riga ${index + 2}.`);
    return { name, vat, city, address };
  });
}

/** Merge only nonempty fields; absent customers, tariffs and journeys are retained. */
export function mergeCustomerCsv(state, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_CUSTOMER_CSV_ROWS) throw new Error('Elenco clienti non valido.');
  const byName = new Map(state.customers.map(customer => [customer.name, { ...customer }]));
  const original = new Map(state.customers.map(customer => [customer.name, customer]));
  const seen = new Set();
  for (const row of rows) {
    const existing = byName.get(row.name);
    const next = existing ? { ...existing } : { id: crypto.randomUUID(), name: row.name, vat: '', city: '', address: '' };
    for (const key of ['vat', 'city', 'address']) if (row[key]) next[key] = row[key];
    byName.set(row.name, next); seen.add(row.name);
  }
  let added = 0, updated = 0;
  for (const name of seen) { const previous = original.get(name); if (!previous) added++; else if (['vat', 'city', 'address'].some(key => previous[key] !== byName.get(name)[key])) updated++; }
  return { state: validateState({ ...state, customers: [...byName.values()] }), added, updated, count: seen.size };
}

export function exportCustomerCsv(state) {
  const quote = value => `"${String(value ?? '').replace(/"/gu, '""')}"`;
  const rows = [...state.customers].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return '\uFEFF' + [HEADER, ...rows.map(customer => [customer.name, customer.vat, customer.city, customer.address])].map(row => row.map(quote).join(';')).join('\r\n') + '\r\n';
}
