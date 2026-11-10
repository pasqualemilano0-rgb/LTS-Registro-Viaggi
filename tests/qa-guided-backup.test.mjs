import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyState, upsertTariff, createTrip } from '../shared/domain.mjs';
import { unionStates, SyncConflictError } from '../shared/sync-merge.mjs';
import { describeBackupConflict } from '../shared/backup-conflict-details.mjs';

const named = () => ({ ...emptyState(), profile: { firstName: 'MARIO', lastName: 'ROSSI' } });
const source = () => upsertTariff(named(), { id: 'rate-1', client: 'AZIENDA A', city: 'NAPOLI', cents: 5000 });
const trip = (state, date, client = 'AZIENDA A') => createTrip({
  id: 'trip-1', date, client, city: 'NAPOLI', container: 'BILICO', services: [],
}, state);

test('backup import detects disagreements and requires explicit choices rather than replacing archive', () => {
  const current = source(), archive = source();
  archive.tariffs[0] = { ...archive.tariffs[0], cents: 7900 };
  const before = JSON.stringify(current), old = JSON.stringify(archive);
  assert.throws(() => unionStates(current, archive, { prefer: null }), error =>
    error instanceof SyncConflictError && error.paths.includes('tariffs[AZIENDA A/NAPOLI].cents'));
  const explain = describeBackupConflict('tariffs[AZIENDA A/NAPOLI].cents', current, archive);
  assert.match(explain.title, /AZIENDA A/);
  assert.match(explain.current, /50,00/);
  assert.match(explain.backup, /79,00/);
  assert.equal(unionStates(current, archive, { choices: { 'tariffs[AZIENDA A/NAPOLI].cents': 'remote' } }).tariffs[0].cents, 5000);
  assert.equal(unionStates(current, archive, { choices: { 'tariffs[AZIENDA A/NAPOLI].cents': 'local' } }).tariffs[0].cents, 7900);
  assert.equal(JSON.stringify(current), before);
  assert.equal(JSON.stringify(archive), old);
});

test('each conflict must be selected: no blanket local/remote preference', () => {
  const current = source(), archive = source();
  current.extraRates.adr = 1500;
  archive.extraRates.adr = 2200;
  archive.tariffs[0] = { ...archive.tariffs[0], cents: 7000 };
  assert.throws(() => unionStates(current, archive, { choices: { 'extraRates.adr': 'remote' } }), SyncConflictError);
  const merged = unionStates(current, archive, { choices: {
    'extraRates.adr': 'remote', 'tariffs[AZIENDA A/NAPOLI].cents': 'local',
  } });
  assert.equal(merged.extraRates.adr, 1500);
  assert.equal(merged.tariffs[0].cents, 7000);
});

test('distinct same-ID Android trips may both survive only after explicit decision', () => {
  const seed = source();
  const current = { ...seed, trips: [trip(seed, '2026-10-01')] };
  const archive = { ...seed, trips: [trip(seed, '2026-11-10')] };
  const snapshot = JSON.stringify(current), sourceSnapshot = JSON.stringify(archive);
  assert.throws(() => unionStates(current, archive, { prefer: null }), SyncConflictError);
  assert.equal(describeBackupConflict('trips[trip-1]', current, archive).allowBoth, true);
  const merged = unionStates(current, archive, { choices: { 'trips[trip-1]': 'both' } });
  assert.equal(merged.trips.length, 2);
  assert.equal(new Set(merged.trips.map(row => row.id)).size, 2);
  assert.deepEqual(new Set(merged.trips.map(row => row.date)), new Set(['2026-10-01', '2026-11-10']));
  assert.equal(JSON.stringify(current), snapshot);
  assert.equal(JSON.stringify(archive), sourceSnapshot);
});

test('same date, container and route cannot be duplicated by choosing both', () => {
  const seed = source();
  const current = { ...seed, trips: [trip(seed, '2026-11-10')] };
  const archive = { ...seed, trips: [trip(seed, '2026-11-10')] };
  archive.trips[0] = { ...archive.trips[0], note: 'NOTA DIVERSA' };
  assert.equal(describeBackupConflict('trips[trip-1]', current, archive).allowBoth, false);
  assert.throws(() => unionStates(current, archive, { choices: { 'trips[trip-1]': 'both' } }), /stessa data, container/);
  assert.equal(unionStates(current, archive, { choices: { 'trips[trip-1]': 'remote' } }).trips.length, 1);
});

test('backup dialog requires per-row confirmation, preview and backup safety gate', () => {
  const app = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.match(app, /Risolvi conflitti del backup/);
  assert.match(app, /describeBackupConflict\(path,previous,imported\)/);
  assert.match(app, /selects.some\(input=>!input.value\)/);
  assert.match(app, /originalFingerprint/);
  assert.match(app, /acknowledge.checked&&backupStarted/);
  assert.match(app, /unionStates\(D.validateState\(state\),imported,\{prefer:null,choices\}\)/);
  assert.doesNotMatch(app, /await persist\(imported\)/);
});
