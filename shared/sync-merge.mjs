import { validateState, reconcileTripTariffs } from './domain.mjs';

export class SyncConflictError extends Error {
  constructor(paths = []) {
    super('Lo stesso dato è stato modificato su entrambi i dispositivi. Le copie sono conservate: controlla le modifiche prima di sincronizzare.');
    this.name = 'SyncConflictError'; this.status = 409; this.paths = paths;
  }
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => value === undefined ? undefined : structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function mergeValue(base, local, remote, path, conflicts, prefer = null) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);
  if (object(base) && object(local) && object(remote)) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
      // Modification time is metadata, never a last-writer-wins rule for data.
      if (key === 'updatedAt' && typeof local[key] === 'string' && typeof remote[key] === 'string')
        result[key] = local[key] > remote[key] ? local[key] : remote[key];
      else {
        const value = mergeValue(base[key], local[key], remote[key], `${path}.${key}`, conflicts, prefer);
        if (value !== undefined) result[key] = value;
      }
    }
    return result;
  }
  if (prefer === 'local') return clone(local);
  if (prefer === 'remote') return clone(remote);
  conflicts.push(path); return clone(remote);
}
function mergeRows(base, local, remote, name, conflicts, prefer) {
  const bases = new Map(base.map(row => [row.id, row]));
  const locals = new Map(local.map(row => [row.id, row]));
  const remotes = new Map(remote.map(row => [row.id, row]));
  const result = [];
  for (const id of new Set([...remotes.keys(), ...locals.keys(), ...bases.keys()])) {
    const value = mergeValue(bases.get(id), locals.get(id), remotes.get(id), `${name}[${id}]`, conflicts, prefer);
    if (value !== undefined) result.push(value);
  }
  return result;
}
/**
 * A corrected customer name is a reference update, including on journeys that
 * another device added offline. Rebase each side through the same stable
 * customer ID before comparing fields; an unrelated company must never inherit
 * that name or tariff merely because a text label was reused.
 */
function rebaseCustomerReferences(base, local, remote, customers) {
  const sources = [base, local, remote];
  const sourceCustomers = sources.map(source => new Map(source.customers.map(row => [row.id, row])));
  const currentById = new Map(customers.map(row => [row.id, row]));
  const currentNames = new Map();
  for (const row of customers) {
    if (!currentNames.has(row.name)) currentNames.set(row.name, []);
    currentNames.get(row.name).push(row.id);
  }
  const renamed = new Map(), oldNames = new Set();
  for (const before of base.customers) {
    const current = currentById.get(before.id);
    if (current && current.name !== before.name) {
      if ((currentNames.get(current.name)?.length ?? 0) !== 1 ||
          (currentNames.get(before.name) ?? []).some(id => id !== before.id))
        throw new SyncConflictError([`customers[${before.id}].name`]);
      renamed.set(before.id, current.name); oldNames.add(before.name);
      for (const source of sourceCustomers) {
        const row = source.get(before.id);
        if (row && row.name !== current.name) oldNames.add(row.name);
      }
    } else if (!current && sourceCustomers.some(source => source.has(before.id) && source.get(before.id).name !== before.name)) {
      // Explicitly choosing a deletion cannot invent an identity for references
      // to the differently named customer on the other device.
      throw new SyncConflictError([`customers[${before.id}]`]);
    }
  }
  if (!renamed.size) return sources;
  return sources.map(source => {
    const aliases = new Map();
    for (const customer of source.customers) if (renamed.has(customer.id)) aliases.set(customer.name, renamed.get(customer.id));
    const reference = (name, path) => {
      if (aliases.has(name)) return aliases.get(name);
      if (oldNames.has(name)) throw new SyncConflictError([path]);
      return name;
    };
    return { ...source,
      tariffs: source.tariffs.map(row => ({ ...row, client: reference(row.client, `tariffs[${row.id}].client`) })),
      trips: source.trips.map(row => ({ ...row,
        client: reference(row.client, `trips[${row.id}].client`),
        secondClient: reference(row.secondClient, `trips[${row.id}].secondClient`),
      })),
    };
  });
}
/** Explicit conflict resolution only: coalesce colliding business keys after ID merge. */
function resolveLogicalCollisions(state, preferred) {
  const preferredCustomers = new Map(preferred.customers.map(row => [row.id, row]));
  const customerGroups = new Map(), customerIds = new Map();
  for (const row of state.customers) {
    if (!customerGroups.has(row.name)) customerGroups.set(row.name, []);
    customerGroups.get(row.name).push(row);
  }
  const customers = [];
  for (const [name, rows] of customerGroups) {
    const chosen = rows.find(row => preferredCustomers.get(row.id)?.name === name) ?? rows[0];
    const customer = { ...chosen };
    for (const field of ['city', 'address', 'vat']) if (!customer[field]) customer[field] = rows.find(row => row[field])?.[field] ?? '';
    for (const row of rows) customerIds.set(row.id, customer.id);
    customers.push(customer);
  }
  const customersById = new Map(customers.map(row => [row.id, row]));
  const preferredTariffs = new Map(preferred.tariffs.map(row => [row.id, row]));
  const tariffGroups = new Map();
  const tariffKey = row => JSON.stringify([row.client, row.city]);
  for (const original of state.tariffs) {
    const customerId = original.customerId === null ? null : customerIds.get(original.customerId) ?? original.customerId;
    const row = { ...original, customerId };
    if (customerId !== null && customersById.has(customerId)) row.client = customersById.get(customerId).name;
    const key = tariffKey(row);
    if (!tariffGroups.has(key)) tariffGroups.set(key, []);
    tariffGroups.get(key).push(row);
  }
  const tariffs = [];
  for (const [key, rows] of tariffGroups) {
    const chosen = rows.find(row => preferredTariffs.has(row.id) && tariffKey(preferredTariffs.get(row.id)) === key)
      ?? rows.find(row => preferredTariffs.has(row.id)) ?? rows[0];
    tariffs.push({ ...chosen, customerId: chosen.customerId ?? rows.find(row => row.customerId !== null)?.customerId ?? null });
  }
  return { ...state, customers, tariffs };
}
/** Conservative three-way merge. Deletions remain deletions; incompatible edits never overwrite. */
export function mergeStates(baseInput, localInput, remoteInput, { prefer = null } = {}) {
  if (![null, 'local', 'remote'].includes(prefer)) throw new Error('Scelta di unione non valida.');
  const base = validateState(baseInput), local = validateState(localInput), remote = validateState(remoteInput);
  const conflicts = [];
  const profile = mergeValue(base.profile, local.profile, remote.profile, 'profile', conflicts, prefer);
  const extraRates = mergeValue(base.extraRates, local.extraRates, remote.extraRates, 'extraRates', conflicts, prefer);
  const customerConflicts = [];
  const customers = mergeRows(base.customers, local.customers, remote.customers, 'customers', customerConflicts, prefer);
  conflicts.push(...customerConflicts);
  const [rebasedBase, rebasedLocal, rebasedRemote] = customerConflicts.length ? [base, local, remote] : rebaseCustomerReferences(base, local, remote, customers);
  const result = {
    schemaVersion: remote.schemaVersion,
    profile,
    extraRates,
    customers,
    tariffs: mergeRows(rebasedBase.tariffs, rebasedLocal.tariffs, rebasedRemote.tariffs, 'tariffs', conflicts, prefer),
    trips: mergeRows(rebasedBase.trips, rebasedLocal.trips, rebasedRemote.trips, 'trips', conflicts, prefer),
  };
  if (conflicts.length) throw new SyncConflictError(conflicts);
  try { return reconcileTripTariffs(validateState(prefer ? resolveLogicalCollisions(result, prefer === 'local' ? local : remote) : result)); }
  catch { throw new SyncConflictError(['archive']); }
}

/**
 * Explicit first association of two independent archives. A choice is required
 * for conflicting catalogue/profile values. Journeys with distinct IDs are preserved;
 * different records with the same global journey ID require an explicit choice.
 */
export function mergeLinkedStates(localInput, remoteInput, { prefer = null } = {}) {
  if (![null, 'local', 'remote'].includes(prefer)) throw new Error('Scelta di unione non valida.');
  const local = validateState(localInput), remote = validateState(remoteInput), conflicts = [];
  const choose = (left, right, path) => {
    if (equal(left, right)) return clone(right);
    if (left === '' || left === null || left === undefined) return clone(right);
    if (right === '' || right === null || right === undefined) return clone(left);
    if (prefer === 'local') return clone(left);
    if (prefer === 'remote') return clone(right);
    conflicts.push(path); return clone(right);
  };
  const profile = Object.fromEntries(['firstName', 'lastName'].map(key => [key, choose(local.profile[key], remote.profile[key], `profile.${key}`)]));
  const extraRates = Object.fromEntries(Object.keys(remote.extraRates).map(key => [key, choose(local.extraRates[key], remote.extraRates[key], `extraRates.${key}`)]));
  const freshId = (id, used) => {
    let candidate = `linked-local-${id}`.slice(0, 120), number = 1;
    const stem = candidate;
    while (used.has(candidate)) candidate = `${stem}-${number++}`;
    used.add(candidate); return candidate;
  };
  const customers = remote.customers.map(clone), customerIds = new Set(customers.map(row => row.id));
  const customerByName = new Map(customers.map((row, index) => [row.name, index])), localCustomerIds = new Map();
  for (const row of local.customers) {
    const index = customerByName.get(row.name);
    if (index !== undefined) {
      const target = customers[index]; localCustomerIds.set(row.id, target.id);
      for (const field of ['city', 'address', 'vat']) target[field] = choose(row[field], target[field], `customers[${row.name}].${field}`);
    } else {
      const id = customerIds.has(row.id) ? freshId(row.id, customerIds) : row.id;
      customerIds.add(id); localCustomerIds.set(row.id, id);
      customerByName.set(row.name, customers.length); customers.push({ ...row, id });
    }
  }
  const tariffs = remote.tariffs.map(clone), tariffIds = new Set(tariffs.map(row => row.id));
  const tariffByKey = new Map(tariffs.map((row, index) => [JSON.stringify([row.client, row.city]), index]));
  for (const row of local.tariffs) {
    const key = JSON.stringify([row.client, row.city]), index = tariffByKey.get(key);
    const customerId = row.customerId === null ? null : localCustomerIds.get(row.customerId);
    if (index !== undefined) {
      tariffs[index].cents = choose(row.cents, tariffs[index].cents, `tariffs[${row.client}/${row.city}].cents`);
      if (tariffs[index].customerId === null) tariffs[index].customerId = customerId;
    } else {
      const id = tariffIds.has(row.id) ? freshId(row.id, tariffIds) : row.id;
      tariffIds.add(id); tariffByKey.set(key, tariffs.length); tariffs.push({ ...row, id, customerId });
    }
  }
  const trips = remote.trips.map(clone), tripIds = new Set(trips.map(row => row.id)), tripById = new Map(trips.map((row, index) => [row.id, index]));
  const semantic = row => { const { id, createdAt, updatedAt, ...fields } = row; return fields; };
  for (const row of local.trips) {
    const index = tripById.get(row.id);
    if (index !== undefined && equal(semantic(row), semantic(trips[index]))) {
      trips[index].createdAt = row.createdAt < trips[index].createdAt ? row.createdAt : trips[index].createdAt;
      trips[index].updatedAt = row.updatedAt > trips[index].updatedAt ? row.updatedAt : trips[index].updatedAt;
    } else if (index !== undefined) {
      // The same global ID denotes the same journey. Duplicating it would
      // duplicate fares: an explicit initial-association choice selects one row.
      trips[index] = choose(row, trips[index], `trips[${row.id}]`);
    } else {
      tripIds.add(row.id); tripById.set(row.id, trips.length); trips.push({ ...row });
    }
  }
  if (conflicts.length) throw new SyncConflictError(conflicts);
  return reconcileTripTariffs(validateState({ schemaVersion: remote.schemaVersion, profile, extraRates, customers, tariffs, trips }));
}

// Target/remote is the archive represented by the code; source/local is this device.
export function unionStates(target, source, options = {}) { return mergeLinkedStates(source, target, options); }
export function resolveMergeStates(base, local, remote, options = {}) { return mergeStates(base, local, remote, options); }
