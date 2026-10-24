import { validateState, reconcileTripTariffs } from '/LTS-Registro-Viaggi/shared/domain.mjs';
import { mergeStates, unionStates, resolveMergeStates } from '/LTS-Registro-Viaggi/shared/sync-merge.mjs';
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';

const DB_NAME = 'lts-registro-iphone-v1';
const listeners = new Set();
const stateListeners = new Set();
const CHANGE_KEY = 'lts-registro-record-changed-v1';
let active = null;
let queue = Promise.resolve();
let blocked = false;
let refreshing = false;
let lastStatus = { status: 'syncing', message: 'Apertura del registro…' };
let published = '';
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANGE_KEY) : null;
const recordVersion = record => record ? JSON.stringify([record.user.id, record.revision, validateState(record.state), record.outbox]) : '';
function status(value) { lastStatus = value; listeners.forEach(callback => callback(value)); }
export function subscribeStatus(callback) {
  listeners.add(callback); callback(lastStatus);
  return () => listeners.delete(callback);
}
export function subscribeState(callback) {
  stateListeners.add(callback);
  return () => stateListeners.delete(callback);
}
function publish(source) {
  if (!active) return;
  const fingerprint = JSON.stringify([active.user.id, active.revision, active.pending, active.state]);
  if (fingerprint === published) return;
  published = fingerprint;
  for (const callback of stateListeners) callback(structuredClone(active), { source });
}
function announce() {
  if (!active) return;
  const change = { userId: active.user.id, revision: active.revision, pending: active.pending, at: Date.now() };
  if (channel) channel.postMessage(change);
  else try { localStorage.setItem(CHANGE_KEY, JSON.stringify(change)); } catch { /* Refresh on return remains available. */ }
}
function enqueue(run) {
  // Also serialize browser tabs when Web Locks is available. Server revisions remain
  // the final guard on browsers without it and on separate devices.
  const result = queue.then(() => navigator.locks?.request
    ? navigator.locks.request('lts-registro-archive', run)
    : run());
  queue = result.catch(() => {});
  return result;
}
function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Archiviazione del telefono non disponibile. Disattiva la navigazione privata e riprova.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('records'); request.result.createObjectStore('meta'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Impossibile aprire l’archivio del telefono. Controlla lo spazio disponibile.'));
  });
}
async function localGet(userId = null) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(['records', 'meta'], 'readonly');
      let result = null;
      const read = key => {
        if (key) {
          const record = transaction.objectStore('records').get(key);
          record.onsuccess = () => { result = record.result || null; };
        }
      };
      if (userId) read(userId);
      else {
        const pointer = transaction.objectStore('meta').get('active');
        pointer.onsuccess = () => read(pointer.result);
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(new Error('Impossibile leggere la copia sul telefono.'));
    });
  } finally { db.close(); }
}
async function localSet(value, { clearLinkIntent = false } = {}) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['records', 'meta'], 'readwrite');
      let guarded = false;
      const meta = transaction.objectStore('meta');
      const write = () => {
        transaction.objectStore('records').put(value, value.user.id);
        meta.put(value.user.id, 'active');
        if (clearLinkIntent) meta.delete('device-link-intent-v1');
      };
      if (clearLinkIntent) write();
      else {
        const read = meta.get('device-link-intent-v1');
        read.onsuccess = () => {
          const intent = read.result;
          // IndexedDB serializes this guard with association setup even in
          // browsers without Web Locks and across tabs sharing this database.
          if (intent?.sourceUserId === value.user.id && intent.targetUserId !== value.user.id) {
            guarded = true; transaction.abort();
          } else write();
        };
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error(guarded ? 'Il collegamento attende conferma. Premi Sincronizza adesso nel profilo: i dati del modulo sono conservati.' : 'Il telefono non ha salvato la copia locale. Libera spazio e riprova.'));
      transaction.onabort = transaction.onerror;
    });
  } finally { db.close(); }
}
async function beginLinkIntent(record, intent) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction(['records', 'meta'], 'readwrite');
    const records = transaction.objectStore('records'), meta = transaction.objectStore('meta');
    let current, existing, reads = 0, guarded = false;
    const checked = () => {
      if (++reads !== 2) return;
      if (existing || recordVersion(current) !== recordVersion(record)) { guarded = true; transaction.abort(); return; }
      meta.put(intent, 'device-link-intent-v1');
    };
    const recordRead = records.get(record.user.id); recordRead.onsuccess = () => { current = recordRead.result; checked(); };
    const intentRead = meta.get('device-link-intent-v1'); intentRead.onsuccess = () => { existing = intentRead.result; checked(); };
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(new Error(guarded ? 'Il registro o il collegamento è cambiato in un’altra scheda. Controlla di nuovo il codice prima di collegare.' : 'Impossibile conservare il collegamento sul telefono. Esporta un backup e riprova.'));
  }); } finally { db.close(); }
}
async function linkIntent(value = undefined) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', value === undefined ? 'readonly' : 'readwrite');
    const meta = transaction.objectStore('meta');
    let result;
    if (value === undefined) { const read = meta.get('device-link-intent-v1'); read.onsuccess = () => { result = read.result; }; }
    else if (value === null) meta.delete('device-link-intent-v1');
    else meta.put(value, 'device-link-intent-v1');
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = transaction.onabort = () => reject(new Error('Impossibile conservare il collegamento sul telefono. Esporta un backup e riprova.'));
  }); } finally { db.close(); }
}
async function deviceCapability() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      // A read/write transaction serializes first access across browser tabs.
      const transaction = db.transaction('meta', 'readwrite');
      const meta = transaction.objectStore('meta');
      const read = meta.get('pages-device-token-v1');
      let token;
      read.onsuccess = () => {
        token = read.result;
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          meta.put(token, 'pages-device-token-v1');
        }
      };
      transaction.oncomplete = () => resolve(token);
      transaction.onerror = transaction.onabort = () => reject(new Error('Il browser non ha conservato l’accesso al tuo archivio. Riprova dopo aver controllato lo spazio disponibile.'));
    });
  } finally { db.close(); }
}
async function api(method, body, endpoint = null) {
  if (navigator.onLine === false) {
    const error = new Error('Sei offline: la copia sul telefono è conservata e verrà sincronizzata quando torni online.');
    error.offline = true; throw error;
  }
  const capability = runtime.deviceToken ? await deviceCapability() : null;
  const configured = new URL(runtime.apiUrl, location.href);
  const url = endpoint ? new URL(endpoint, configured) : configured;
  if (url.origin !== configured.origin || (endpoint && !['/api/device-link', '/api/push'].includes(url.pathname)) || url.username || url.password) throw new Error('Indirizzo del servizio non valido.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const offlineFailure = () => {
    const error = new Error('Connessione assente: la copia sul telefono è conservata e verrà sincronizzata quando torni online.');
    error.offline = true; return error;
  };
  const incompleteFailure = (message, response) => {
    const error = new Error(message);
    if (!response.ok) error.status = response.status;
    return error;
  };
  try {
    let response;
    try {
      response = await fetch(url.href, {
        method, credentials: capability ? 'omit' : 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(capability ? { Authorization: `LTSDevice ${capability}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(body?.baseState ? { 'X-LTS-Sync': '1' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw offlineFailure(); }
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw incompleteFailure('Il servizio non ha risposto correttamente. Riprova tra poco: non occorrono credenziali di accesso.', response);
    let result;
    try { result = await response.json(); }
    catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error instanceof TypeError) throw offlineFailure();
      throw incompleteFailure('Il server ha restituito una risposta incompleta. Riprova.', response);
    }
    if (!response.ok) {
      const error = new Error(result.error || 'Sincronizzazione non completata.');
      error.status = response.status; error.details = result; throw error;
    }
    return result;
  } finally {
    // Receiving headers does not complete a request. Keep the same deadline
    // through body parsing so a stalled reply cannot hold the queue forever.
    clearTimeout(timeout);
  }
}

export function pushRequest(method, body) {
  if (!['GET', 'POST'].includes(method)) throw new Error('Operazione notifiche non valida.');
  return api(method, body, '/api/push');
}

function unknownNoteIds(record) {
  const baseline = record.baseState;
  if (baseline) return new Set(baseline.trips.filter(trip => !Object.hasOwn(trip, 'note')).map(trip => String(trip.id).trim()));
  // Very old cookie records did not keep a baseState. Remember field presence
  // before offline validation adds note:'' and before saving that local copy.
  return new Set((record.unknownNoteIds ?? record.state.trips.filter(trip => !Object.hasOwn(trip, 'note')).map(trip => trip.id)).map(id => String(id).trim()));
}
function newRequestState(state) {
  const value = structuredClone(state);
  if (runtime.deviceToken) return value;
  const unknown = unknownNoteIds(active);
  for (const trip of value.trips) if (trip.note === '' && unknown.has(trip.id)) delete trip.note;
  return value;
}
function makePending(state) {
  const outbox = active.outbox || { state: newRequestState(state), baseRevision: active.revision, ...(active.baseState ? { baseState: structuredClone(active.baseState) } : {}), requestId: crypto.randomUUID() };
  active = { ...active, state: structuredClone(state), pending: true, outbox };
}
async function reconcile(source) {
  const next = reconcileTripTariffs(active.state);
  if (JSON.stringify(next) === JSON.stringify(active.state)) return;
  makePending(next);
  await localSet(active);
  try { await flush(source); }
  catch (error) { if (!error.offline && ![500, 502, 503, 504].includes(error.status)) throw error; }
}
async function loadRecord(options = {}, source = 'load') {
  let local = await localGet();
  let remote;
  try { remote = await api('GET'); }
  catch (error) {
    if (local && (error.offline || [500, 502, 503, 504].includes(error.status)) && !options.preferRemote && !options.requireOnline) {
      active = { ...local, unknownNoteIds: [...unknownNoteIds(local)], state: validateState(local.state) }; blocked = Boolean(active.conflict);
      status({ status: 'offline', message: 'Modalità offline · copia salvata sul telefono' });
      publish(source);
      return structuredClone(active);
    }
    status({ status: 'error', message: error.message }); throw error;
  }
  remote.state = validateState(remote.state);
  if (!remote.user?.id || !Number.isSafeInteger(remote.revision)) throw new Error('Il server non ha identificato il tuo registro. Riprova.');
  const intent = runtime.deviceToken ? await linkIntent() : null;
  if (intent?.targetUserId === remote.user.id && intent.sourceUserId !== remote.user.id) {
    // A successful association whose response was lost still restores the
    // explicitly confirmed union. Never merge archives merely by driver name.
    return adoptLinkedRecord(remote, intent.sourceState, intent.prefer, source);
  }
  if (intent && intent.sourceUserId === remote.user.id && intent.targetUserId !== remote.user.id) {
    // A failed response does not prove whether the binding committed. Retry the
    // same one-use code before accepting new writes against the old identity.
    if (!intent.code) throw new Error('Il collegamento attende una verifica. Controlla di nuovo il codice dal profilo; i dati del dispositivo sono conservati.');
    let linked;
    try {
      linked = await api('POST', { action: 'redeem', code: intent.code, confirm: true, expectedTargetRevision: intent.targetRevision }, '/api/device-link');
    } catch (error) {
      if ([400, 401, 403, 409, 410, 413, 415, 422].includes(error.status)) await linkIntent(null);
      throw error;
    }
    if (linked.user?.id !== intent.targetUserId || !Number.isSafeInteger(linked.revision)) throw new Error('Collegamento non confermato. Riprova: la copia locale è conservata.');
    return adoptLinkedRecord(linked, intent.sourceState, intent.prefer, source);
  }
  if (intent && intent.targetUserId !== remote.user.id) throw new Error('Il collegamento restituisce un archivio diverso da quello confermato. Le copie locali sono conservate: verifica il codice prima di continuare.');
  if (local?.user.id !== remote.user.id) local = await localGet(remote.user.id);
  blocked = false;
  if (local?.user.id === remote.user.id && local.pending && !options.preferRemote) {
    active = { ...local, linked: Boolean(local.linked || remote.user.linked || remote.linked) };
    blocked = Boolean(active.conflict);
    try { await flush(source); await reconcile(source); }
    catch (error) { if (error.status === 401) throw error; }
    publish(source);
    return structuredClone(active);
  }
  active = { state: remote.state, baseState: structuredClone(remote.state), revision: remote.revision, user: remote.user, updatedAt: remote.updatedAt, linked: Boolean(remote.linked || remote.user.linked || local?.linked), pending: false, outbox: null, conflict: null };
  await localSet(active);
  await reconcile(source);
  status({ status: active.pending ? 'pending' : 'synced', message: active.pending ? 'Aggiornamento tariffe salvato sul dispositivo · sincronizzazione in attesa' : 'Dati salvati online' });
  publish(source);
  return structuredClone(active);
}
export function loadState(options = {}) { return enqueue(() => loadRecord(options)); }
async function flush(source = 'background') {
  if (!active?.pending || blocked) return;
  status({ status: 'syncing', message: 'Salvataggio online…' });
  try {
    while (active.pending) {
      const target = active.outbox || { state: newRequestState(active.state), baseRevision: active.revision, ...(active.baseState ? { baseState: structuredClone(active.baseState) } : {}), requestId: active.requestId || crypto.randomUUID() };
      // An unacknowledged request is immutable. Later offline edits wait behind it.
      active.outbox = target;
      await localSet(active);
      const payload = { ...target, expectedUserId: active.user.id };
      // The old cookie/account endpoint keeps its existing revision-only protocol.
      if (!runtime.deviceToken) delete payload.baseState;
      const remote = await api('POST', payload);
      const acknowledged = validateState(remote.state);
      const caughtUp = JSON.stringify(validateState(active.state)) === JSON.stringify(validateState(target.state));
      let nextState;
      try { nextState = caughtUp ? acknowledged : mergeStates(target.state, active.state, acknowledged); }
      catch (error) {
        active = { ...active, revision: remote.revision, baseState: acknowledged, outbox: null,
          updatedAt: remote.updatedAt, conflict: { paths: error.paths || [], baseState: structuredClone(target.state), remoteState: acknowledged, revision: remote.revision } };
        await localSet(active);
        error.status = 409; throw error;
      }
      active = { ...active, state: nextState, baseState: structuredClone(acknowledged), revision: remote.revision,
        linked: Boolean(remote.linked || remote.user?.linked || active.linked), updatedAt: remote.updatedAt, pending: !caughtUp, conflict: null,
        outbox: caughtUp ? null : { state: structuredClone(nextState), baseState: structuredClone(acknowledged), baseRevision: remote.revision, requestId: crypto.randomUUID() } };
      await localSet(active);
    }
    status({ status: 'synced', message: 'Dati salvati online' });
    publish(source); announce();
  } catch (error) {
    blocked = error.status === 409;
    if (blocked) {
      active.conflict = { ...active.conflict, paths: error.details?.conflicts || error.paths || active.conflict?.paths || [] };
      await localSet(active);
    }
    status({ status: blocked ? 'conflict' : error.offline ? 'offline' : 'pending', message: error.message });
    error.pendingState = structuredClone(active.state);
    publish(source);
    throw error;
  }
}
export function getSyncInfo() {
  return { linked: Boolean(active?.linked), pending: Boolean(active?.pending), conflict: Boolean(blocked || active?.conflict), status: lastStatus.status };
}
function requireDeviceLink() {
  if (!runtime.deviceToken) throw new Error('Apri LTS dall’indirizzo GitHub per collegare i dispositivi. Il registro attuale resta conservato.');
}
export async function createDeviceLink() {
  requireDeviceLink();
  await syncPending();
  return enqueue(() => api('POST', { action: 'create' }, '/api/device-link'));
}
export function previewDeviceLink(code) {
  requireDeviceLink();
  return enqueue(async () => {
    if (await linkIntent()) throw new Error('Un collegamento attende conferma. Premi Sincronizza adesso nel profilo prima di controllare un altro codice.');
    return { ...await api('POST', { action: 'preview', code: String(code).trim() }, '/api/device-link'), localVersion: recordVersion(active) };
  });
}
async function adoptLinkedRecord(remote, sourceState, prefer, source = 'link') {
  const target = validateState(remote.state);
  const merged = unionStates(target, sourceState, { prefer });
  const pending = JSON.stringify(merged) !== JSON.stringify(target);
  active = { state: merged, baseState: structuredClone(target), user: remote.user, revision: remote.revision,
    updatedAt: remote.updatedAt, linked: true, pending, conflict: null,
    outbox: pending ? { state: structuredClone(merged), baseState: structuredClone(target), baseRevision: remote.revision, requestId: crypto.randomUUID() } : null };
  blocked = false;
  await localSet(active, { clearLinkIntent: true });
  try { await flush(source); }
  catch (error) { if (!error.offline && ![500, 502, 503, 504].includes(error.status) && error.status !== 409) throw error; }
  status({ status: blocked ? 'conflict' : active.pending ? 'pending' : 'synced', message: blocked ? 'Dispositivi collegati · controlla le modifiche dal profilo' : active.pending ? 'Dispositivi collegati · unione conservata sul telefono, sincronizzazione in attesa' : 'Dispositivi collegati · archivio condiviso aggiornato' });
  publish('link'); announce(); return structuredClone(active);
}
export function redeemDeviceLink(code, { prefer = null, preview } = {}) {
  requireDeviceLink();
  return enqueue(async () => {
    if (!active) throw new Error('Apri prima il registro.');
    if (await linkIntent()) throw new Error('Un collegamento attende conferma. Premi Sincronizza adesso nel profilo prima di collegare di nuovo.');
    if (!preview?.state || !preview.user?.id || !Number.isSafeInteger(preview.revision)) throw new Error('Controlla nuovamente il codice prima di collegare i dispositivi.');
    const latest = await localGet(active.user.id);
    if (preview.localVersion !== recordVersion(active) || (latest && recordVersion(latest) !== recordVersion(active))) throw new Error('I dati su questo dispositivo sono cambiati. Premi di nuovo Controlla codice prima di collegare.');
    // The previous record is never removed: it remains a separate recovery copy.
    const previous = structuredClone(active);
    unionStates(preview.state, previous.state, { prefer });
    await beginLinkIntent(previous, { sourceUserId: previous.user.id, targetUserId: preview.user.id, sourceState: previous.state,
      code: String(code).trim(), targetRevision: preview.revision, prefer, createdAt: Date.now() });
    let remote;
    try { remote = await api('POST', { action: 'redeem', code: String(code).trim(), confirm: true, expectedTargetRevision: preview.revision }, '/api/device-link'); }
    catch (error) {
      // An unreadable or lost success response can follow a completed server
      // association. Only a definite client rejection proves it did not happen.
      if ([400, 401, 403, 409, 410, 413, 415, 422].includes(error.status)) await linkIntent(null);
      throw error;
    }
    if (remote.user?.id !== preview.user.id || !Number.isSafeInteger(remote.revision)) throw new Error('Collegamento non confermato. Riprova: la copia locale è conservata.');
    return adoptLinkedRecord(remote, previous.state, prefer);
  });
}
export function inspectSyncConflict() {
  return enqueue(async () => {
    if (!active) throw new Error('Apri prima il registro.');
    const remote = await api('GET');
    if (remote.user?.id !== active.user.id) throw new Error('Il registro collegato è cambiato. Riapri l’app prima di continuare.');
    const checked = validateState(remote.state);
    let paths = active.conflict?.paths || [];
    const base = active.conflict?.baseState || active.outbox?.baseState || active.baseState;
    if (base) {
      try { mergeStates(base, active.state, checked); paths = []; }
      catch (error) { paths = error.paths || paths; }
    }
    return { local: structuredClone(active.state), remote: checked, revision: remote.revision, paths };
  });
}
export function resolveSyncConflict(choice, expectedRevision) {
  return enqueue(async () => {
    if (!['local', 'remote'].includes(choice)) throw new Error('Scegli quale copia conservare.');
    const remote = await api('GET');
    if (remote.user?.id !== active?.user.id || remote.revision !== expectedRevision) throw new Error('Il registro online è cambiato ancora. Controlla nuovamente le due copie prima di scegliere.');
    const checked = validateState(remote.state);
    const base = active.conflict?.baseState || active.outbox?.baseState || active.baseState;
    if (!base) throw new Error('Questa vecchia coda non contiene una base verificabile. Esporta la copia locale e usa Ricarica dati online prima di importare le modifiche da conservare.');
    const merged = resolveMergeStates(base, active.state, checked, { prefer: choice });
    {
      // Keep the unconfirmed local archive under a separate recovery key.
      const db = await database();
      try { await new Promise((resolve, reject) => {
        const transaction = db.transaction('records', 'readwrite');
        transaction.objectStore('records').put(structuredClone(active), `${active.user.id}:recovery:${crypto.randomUUID()}`);
        transaction.oncomplete = resolve; transaction.onerror = transaction.onabort = () => reject(new Error('Impossibile conservare la copia di recupero. Esporta un backup e riprova.'));
      }); } finally { db.close(); }
    }
    const pending = JSON.stringify(merged) !== JSON.stringify(checked);
    active = { ...active, state: merged, baseState: structuredClone(checked), revision: remote.revision, updatedAt: remote.updatedAt, pending, conflict: null,
      outbox: pending ? { state: structuredClone(merged), baseState: structuredClone(checked), baseRevision: remote.revision, requestId: crypto.randomUUID() } : null };
    blocked = false; await localSet(active);
    if (active.pending) await flush('resolve');
    status({ status: 'synced', message: 'Scelta confermata · archivio condiviso aggiornato' });
    publish('resolve'); announce(); return structuredClone(active);
  });
}
export function saveState(value) {
  const state = reconcileTripTariffs(validateState(value));
  const expectedVersion = recordVersion(active);
  return enqueue(async () => {
    if (!active) throw new Error('Apri prima il registro.');
    if (runtime.deviceToken && await linkIntent()) {
      throw new Error('Il collegamento tra dispositivi attende conferma. Premi Sincronizza adesso nel profilo prima di salvare: i dati del modulo sono conservati.');
    }
    const latest = await localGet(active.user.id);
    if (expectedVersion !== recordVersion(active) || (latest && recordVersion(latest) !== recordVersion(active))) {
      // Another tab may have saved while this form was open. Do not replace its
      // archive with a stale whole-state form submission; preserve the form draft.
      if (latest) active = latest;
      publish('background');
      throw new Error('Il registro è stato aggiornato in un’altra scheda. Controlla i dati aggiornati e premi di nuovo Salva. I dati del modulo sono conservati.');
    }
    makePending(state);
    await localSet(active);
    if (blocked) {
      const error = new Error('Modifica conservata sul telefono. Apri Profilo → Risolvi sincronizzazione per controllare i dati modificati anche sull’altro dispositivo.');
      error.status = 409; error.pendingState = structuredClone(state); publish('save'); announce(); throw error;
    }
    try { await flush('save'); }
    catch (error) { if (!error.offline && ![500, 502, 503, 504].includes(error.status)) throw error; }
    announce();
    return structuredClone(active);
  });
}
export function syncPending() {
  return enqueue(async () => {
    if (blocked) throw new Error('Lo stesso dato è cambiato su due dispositivi. Apri Profilo → Risolvi sincronizzazione. Le copie sono conservate.');
    // Reading the latest local record also picks up another tab’s immutable outbox.
    const result = await loadRecord({ requireOnline: true }, 'background');
    if (result?.pending) {
      const error = new Error(lastStatus.message || 'Le modifiche sono conservate sul dispositivo, ma il salvataggio online non è stato confermato.');
      error.pendingState = structuredClone(result.state);
      if (blocked) error.status = 409;
      throw error;
    }
    return result;
  });
}
function refreshSoon() {
  if (!active || blocked || refreshing || document.hidden || navigator.onLine === false) return;
  refreshing = true;
  syncPending().catch(() => {}).finally(() => { refreshing = false; });
}
channel?.addEventListener('message', event => {
  if (event.data?.userId === active?.user.id) refreshSoon();
});
window.addEventListener('storage', event => { if (event.key === CHANGE_KEY) refreshSoon(); });
window.addEventListener('online', refreshSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSoon(); });
setInterval(refreshSoon, 20000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/LTS-Registro-Viaggi/sw.js', { scope: "/LTS-Registro-Viaggi/" }).catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
