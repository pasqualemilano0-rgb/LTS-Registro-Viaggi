/** Shared, dependency-free rules for EFFE.ERRE Registro Viaggi. Amounts are integer cents. */
export const SCHEMA_VERSION = 1;
export const MAX_CENTS = 99999999;
export const SERVICES = Object.freeze([
  { key: 'facchinaggioBilico', label: 'FACCHINAGGIO BILICO' },
  { key: 'facchinaggioReefer', label: 'FACCHINAGGIO REEFER' },
  { key: 'reefer', label: 'REEFER' },
  { key: 'adr', label: 'ADR' },
  { key: 'pernotto', label: 'PERNOTTO' },
  { key: 'sabatoPorto', label: 'SABATO PORTO' },
  { key: 'sabatoTrasferta', label: 'SABATO TRASFERTA' },
].map(Object.freeze));
const SERVICE_KEYS = new Set(SERVICES.map(item => item.key));
const MAX_ROWS = 100000;
const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

export function normalizeText(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleUpperCase('it-IT');
}

export function normalizeContainer(value) {
  const text = normalizeText(value);
  // Special descriptions such as BILICO remain possible, as in the Android app.
  return /^[A-Z]{4}\d{7}$/u.test(text) ? `${text.slice(0, 10)}.${text.slice(10)}` : text;
}

export function toCents(value) {
  let text = String(value ?? '').trim().replace(/\s|€/gu, '');
  if (!text) throw new Error('Inserisci un importo.');
  if (text.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/u.test(text)) throw new Error('Importo non valido: usa al massimo due decimali.');
    text = text.replace(/\./gu, '').replace(',', '.');
  }
  if (!/^\d+(?:\.\d{1,2})?$/u.test(text)) throw new Error('Importo non valido: usa al massimo due decimali.');
  const [euros, decimals = ''] = text.split('.');
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  return checkCents(cents, 'Importo');
}

export function formatMoney(cents) {
  if (cents === null || cents === undefined) return '—';
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Importo non valido.');
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function emptyExtraRates() {
  return Object.fromEntries(SERVICES.map(service => [service.key, null]));
}

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { firstName: '', lastName: '' },
    trips: [], customers: [], tariffs: [], extraRates: emptyExtraRates(),
  };
}

function checkCents(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new Error(`${field}: importo non valido.`);
  return value;
}

function textField(value, label, required = false, maximum = 500) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`${label}: testo non valido.`);
  const text = normalizeText(value);
  if (required && !text) throw new Error(`Inserisci ${label.toLocaleLowerCase('it-IT')}.`);
  if (text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new Error(`${label}: testo troppo lungo o non valido.`);
  return text;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: formato non valido.`);
  return value;
}

function id(value, label = 'Identificativo') {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim().length === 0 || String(value).length > 128) throw new Error(`${label} non valido.`);
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${label} non valido.`);
  return String(value).trim();
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2199-12-31';
}

function timestamp(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new Error('Data di registrazione non valida.');
  return new Date(value).toISOString();
}

export function validateTrip(input) {
  const errors = {};
  const draft = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: { trip: 'Viaggio non valido.' }, value: null };
  for (const field of ['client', 'city', 'container', 'secondClient', 'secondCity']) {
    try {
      const labels = { client: 'Cliente', city: 'Località', container: 'Container', secondClient: 'Cliente della seconda presa', secondCity: 'Località della seconda presa' };
      draft[field] = textField(input[field], labels[field], ['client', 'city', 'container'].includes(field));
    } catch (error) { errors[field] = error.message; }
  }
  draft.container = normalizeContainer(draft.container);
  if (!validDate(input.date)) errors.date = 'Scegli una data valida.';
  draft.date = input.date;
  if (Boolean(draft.secondClient) !== Boolean(draft.secondCity)) {
    if (!draft.secondClient) errors.secondClient = 'Inserisci il cliente della seconda presa.';
    if (!draft.secondCity) errors.secondCity = 'Inserisci la località della seconda presa.';
  }
  const services = input.services ?? [];
  if (!Array.isArray(services) || services.some(key => !SERVICE_KEYS.has(key))) errors.services = 'Servizio non riconosciuto.';
  else draft.services = SERVICES.filter(service => services.includes(service.key)).map(service => service.key);
  return { valid: Object.keys(errors).length === 0, errors, value: draft };
}

export function findTariff(state, client, city) {
  const normalizedClient = normalizeText(client);
  const normalizedCity = normalizeText(city);
  return state.tariffs.find(tariff => normalizeText(tariff.client) === normalizedClient && normalizeText(tariff.city) === normalizedCity) ?? null;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-') : `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${Date.now().toString(36)}-${random}`;
}

export function createTrip(input, state, existing = null) {
  const validation = validateTrip(input);
  if (!validation.valid) {
    const error = new Error(Object.values(validation.errors)[0]);
    error.errors = validation.errors;
    throw error;
  }
  const trip = validation.value;
  const now = new Date().toISOString();
  const sameFirst = existing && normalizeText(existing.client) === trip.client && normalizeText(existing.city) === trip.city;
  const sameSecond = existing && normalizeText(existing.secondClient) === trip.secondClient && normalizeText(existing.secondCity) === trip.secondCity;
  const extraCents = emptyExtraRates();
  for (const service of trip.services) {
    const retained = existing?.services?.includes(service) ? existing.extraCents?.[service] ?? null : null;
    extraCents[service] = checkCents(state.extraRates[service] ?? retained, 'Extra', true);
  }
  return {
    ...trip,
    id: id(existing?.id ?? input.id ?? newId()),
    fareCents: checkCents(findTariff(state, trip.client, trip.city)?.cents ?? (sameFirst ? existing.fareCents : null), 'Trasferta', true),
    secondFareCents: trip.secondCity ? checkCents(findTariff(state, trip.secondClient, trip.secondCity)?.cents ?? (sameSecond ? existing.secondFareCents : null), 'Seconda trasferta', true) : null,
    sumPickupFares: Boolean(trip.secondCity),
    extraCents,
    createdAt: timestamp(existing?.createdAt, now),
    updatedAt: now,
  };
}

export function tripAmounts(trip) {
  const hasSecond = Boolean(trip.secondCity) && trip.sumPickupFares !== false;
  const selected = new Set(trip.services ?? []);
  let pickupCents = checkCents(trip.fareCents, 'Trasferta', true) ?? 0;
  if (hasSecond) pickupCents += checkCents(trip.secondFareCents, 'Seconda trasferta', true) ?? 0;
  let extraCents = 0;
  let missing = trip.fareCents === null || trip.fareCents === undefined || (hasSecond && (trip.secondFareCents === null || trip.secondFareCents === undefined));
  for (const service of selected) {
    if (!SERVICE_KEYS.has(service)) throw new Error('Servizio non riconosciuto.');
    const cents = checkCents(trip.extraCents?.[service], 'Extra', true);
    extraCents += cents ?? 0;
    missing ||= cents === null;
  }
  const totalCents = pickupCents + extraCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error('Totale troppo elevato.');
  return { pickupCents, extraCents, totalCents, missingTariff: Boolean(missing) };
}

export function sortTrips(trips) {
  return [...trips].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export function monthlyTrips(stateOrTrips, month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) throw new Error('Mese non valido.');
  return sortTrips((Array.isArray(stateOrTrips) ? stateOrTrips : stateOrTrips.trips).filter(trip => trip.date.startsWith(`${month}-`)));
}

export function monthlySummary(stateOrTrips, month) {
  return monthlyTrips(stateOrTrips, month).reduce((summary, trip) => {
    const amount = tripAmounts(trip);
    summary.count++;
    summary.pickupCents += amount.pickupCents;
    summary.extraCents += amount.extraCents;
    summary.totalCents += amount.totalCents;
    if (amount.missingTariff) summary.missingTariffCount++;
    if (!Number.isSafeInteger(summary.totalCents)) throw new Error('Totale mensile troppo elevato.');
    return summary;
  }, { count: 0, pickupCents: 0, extraCents: 0, totalCents: 0, missingTariffCount: 0 });
}

function normalizeRates(rates, label) {
  object(rates, label);
  if (Object.keys(rates).some(key => !SERVICE_KEYS.has(key))) throw new Error(`${label}: servizio non riconosciuto.`);
  return Object.fromEntries(SERVICES.map(service => [service.key, checkCents(rates[service.key], label, true)]));
}

function list(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error(`${label}: elenco non valido o troppo grande.`);
  return value;
}

function unique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`${label}: elemento duplicato.`);
    seen.add(value);
  }
}

export function validateState(input) {
  object(input, 'Archivio');
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error('Versione archivio non supportata.');
  const profile = object(input.profile, 'Profilo');
  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    profile: { firstName: textField(profile.firstName, 'Nome', false, 200), lastName: textField(profile.lastName, 'Cognome', false, 200) },
    customers: list(input.customers, 'Clienti').map(customer => {
      object(customer, 'Cliente');
      return { id: id(customer.id), name: textField(customer.name, 'Nome cliente', true), city: textField(customer.city, 'Località'), address: textField(customer.address, 'Indirizzo', false, 1000), vat: textField(customer.vat, 'Partita IVA', false, 100) };
    }),
    tariffs: list(input.tariffs, 'Tariffe').map(tariff => {
      object(tariff, 'Tariffa');
      return { id: id(tariff.id), customerId: tariff.customerId === null || tariff.customerId === undefined || tariff.customerId === '' ? null : id(tariff.customerId), client: textField(tariff.client, 'Cliente tariffa', true), city: textField(tariff.city, 'Località tariffa', true), cents: checkCents(tariff.cents, 'Tariffa') };
    }),
    extraRates: normalizeRates(input.extraRates, 'Tariffe extra'),
    trips: list(input.trips, 'Viaggi').map(trip => {
      object(trip, 'Viaggio');
      const checked = validateTrip(trip);
      if (!checked.valid) throw new Error(`Viaggio ${String(trip.id ?? '')}: ${Object.values(checked.errors)[0]}`);
      const hasSecond = Boolean(checked.value.secondCity);
      if (trip.sumPickupFares !== undefined && typeof trip.sumPickupFares !== 'boolean') throw new Error('Modalità seconda presa non valida.');
      return {
        ...checked.value, id: id(trip.id),
        fareCents: checkCents(trip.fareCents, 'Trasferta', true),
        secondFareCents: hasSecond ? checkCents(trip.secondFareCents, 'Seconda trasferta', true) : null,
        sumPickupFares: hasSecond && trip.sumPickupFares !== false,
        extraCents: normalizeRates(trip.extraCents ?? {}, 'Extra viaggio'),
        createdAt: timestamp(trip.createdAt, `${trip.date}T00:00:00.000Z`),
        updatedAt: timestamp(trip.updatedAt, `${trip.date}T00:00:00.000Z`),
      };
    }),
  };
  unique(normalized.customers, customer => customer.id, 'Clienti');
  unique(normalized.customers, customer => customer.name, 'Nomi clienti');
  unique(normalized.tariffs, tariff => tariff.id, 'Tariffe');
  unique(normalized.tariffs, tariff => JSON.stringify([tariff.client, tariff.city]), 'Cliente e località tariffa');
  unique(normalized.trips, trip => trip.id, 'Viaggi');
  const customersById = new Map(normalized.customers.map(customer => [customer.id, customer]));
  for (const tariff of normalized.tariffs) {
    if (tariff.customerId !== null) {
      const customer = customersById.get(tariff.customerId);
      if (!customer || customer.name !== tariff.client) throw new Error('Tariffa collegata a un cliente non valido.');
    }
  }
  return normalized;
}

export function exportBackup(state) {
  return JSON.stringify({ format: 'EFFEERRE-REGISTRO-WEB', version: 1, createdAt: new Date().toISOString(), data: validateState(state) }, null, 2);
}

export function importBackup(source) {
  let backup;
  try {
    if (typeof source === 'string') {
      if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup troppo grande.');
      backup = JSON.parse(source);
    } else backup = source;
    object(backup, 'Backup');
    if (backup.format !== 'EFFEERRE-REGISTRO-WEB' || backup.version !== 1) throw new Error('Formato backup non supportato.');
    return validateState(backup.data);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Il file non è un backup JSON valido.');
    throw error;
  }
}

/** Update only changed trip fields, retaining record dates for unaffected trips. */
function updateTripFields(trip, fields, updatedAt) {
  const changed = Object.entries(fields).some(([key, value]) => key === 'extraCents'
    ? SERVICES.some(service => trip.extraCents?.[service.key] !== value[service.key])
    : trip[key] !== value);
  return changed ? { ...trip, ...fields, updatedAt } : trip;
}

/**
 * Refresh an existing archive against today's catalogue without discarding prices
 * imported for routes or services that have no configured rate in this archive.
 * The Android legacy second-pickup summation flag is deliberately preserved.
 */
export function reconcileTripTariffs(state) {
  const normalized = validateState(state);
  const now = new Date().toISOString();
  const prices = new Map(normalized.tariffs.map(tariff => [JSON.stringify([tariff.client, tariff.city]), tariff.cents]));
  const trips = normalized.trips.map(trip => {
    const first = prices.get(JSON.stringify([trip.client, trip.city]));
    const second = trip.secondCity ? prices.get(JSON.stringify([trip.secondClient, trip.secondCity])) : undefined;
    const extraCents = { ...trip.extraCents };
    for (const service of trip.services) {
      if (normalized.extraRates[service] !== null) extraCents[service] = normalized.extraRates[service];
    }
    return updateTripFields(trip, {
      fareCents: first ?? trip.fareCents,
      secondFareCents: second ?? trip.secondFareCents,
      extraCents,
    }, now);
  });
  return { ...normalized, trips };
}

/** Selected extras are charged once per journey, and changed rates update all months. */
export function upsertExtraRates(state, input) {
  const extraRates = normalizeRates(input, 'Tariffe extra');
  const changed = SERVICES.filter(service => state.extraRates[service.key] !== extraRates[service.key]).map(service => service.key);
  const now = new Date().toISOString();
  const trips = state.trips.map(trip => {
    const extraCents = { ...trip.extraCents };
    for (const service of changed) {
      if (trip.services.includes(service)) extraCents[service] = extraRates[service];
    }
    return updateTripFields(trip, { extraCents }, now);
  });
  return validateState({ ...state, extraRates, trips });
}

/** Customer name corrections stay aligned with tariff entries and both pickups. */
export function upsertCustomer(state, input) {
  object(input, 'Cliente');
  const customer = {
    id: id(input.id ?? newId()), name: textField(input.name, 'Nome cliente', true),
    city: textField(input.city, 'Località'), address: textField(input.address, 'Indirizzo', false, 1000), vat: textField(input.vat, 'Partita IVA', false, 100),
  };
  if (state.customers.some(item => item.id !== customer.id && normalizeText(item.name) === customer.name)) throw new Error('Questo cliente è già presente.');
  const existing = state.customers.find(item => item.id === customer.id);
  const customers = existing ? state.customers.map(item => item.id === customer.id ? customer : item) : [...state.customers, customer];
  const tariffs = state.tariffs.map(tariff => tariff.customerId === customer.id || (existing && normalizeText(tariff.client) === existing.name)
    ? { ...tariff, customerId: customer.id, client: customer.name } : tariff);
  const now = new Date().toISOString();
  const trips = existing && existing.name !== customer.name ? state.trips.map(trip => updateTripFields(trip, {
    client: normalizeText(trip.client) === existing.name ? customer.name : trip.client,
    secondClient: normalizeText(trip.secondClient) === existing.name ? customer.name : trip.secondClient,
  }, now)) : state.trips;
  return validateState({ ...state, customers, tariffs, trips });
}

/** Customer creation/linking is part of saving a tariff, as on Android. */
export function upsertTariff(state, input) {
  object(input, 'Tariffa');
  const client = textField(input.client, 'Cliente tariffa', true);
  const city = textField(input.city, 'Località tariffa', true);
  const cents = checkCents(input.cents, 'Tariffa');
  let customer = input.customerId ? state.customers.find(item => item.id === String(input.customerId)) : state.customers.find(item => normalizeText(item.name) === client);
  if (input.customerId && (!customer || normalizeText(customer.name) !== client)) throw new Error('Scegli un cliente valido per la tariffa.');
  let customers = state.customers;
  if (!customer) {
    customer = { id: newId(), name: client, city, address: '', vat: '' };
    customers = [...customers, customer];
  } else if (!customer.city) customers = customers.map(item => item.id === customer.id ? { ...item, city } : item);
  const tariffId = id(input.id ?? findTariff(state, client, city)?.id ?? newId());
  if (state.tariffs.some(item => item.id !== tariffId && normalizeText(item.client) === client && normalizeText(item.city) === city)) throw new Error('Esiste già una tariffa per questo cliente e questa località.');
  const tariff = { id: tariffId, customerId: customer.id, client, city, cents };
  const tariffs = state.tariffs.some(item => item.id === tariffId) ? state.tariffs.map(item => item.id === tariffId ? tariff : item) : [...state.tariffs, tariff];
  const now = new Date().toISOString();
  const trips = state.trips.map(trip => updateTripFields(trip, {
    fareCents: normalizeText(trip.client) === client && normalizeText(trip.city) === city ? cents : trip.fareCents,
    secondFareCents: trip.secondCity && normalizeText(trip.secondClient) === client && normalizeText(trip.secondCity) === city ? cents : trip.secondFareCents,
  }, now));
  return validateState({ ...state, customers, tariffs, trips });
}
