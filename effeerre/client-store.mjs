import { validateState, reconcileTripTariffs } from '/LTS-Registro-Viaggi/effeerre/shared/domain.mjs';
import runtime from '/LTS-Registro-Viaggi/effeerre/runtime-config.mjs';

const DB_NAME = 'effeerre-registro-iphone-v1';
const listeners = new Set();
const stateListeners = new Set();
const CHANGE_KEY = 'effeerre-registro-record-changed-v1';
let active = null;
let queue = Promise.resolve();
let blocked = false;
let refreshing = false;
let lastStatus = { status: 'syncing', message: 'Apertura del registro…' };
let published = '';
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANGE_KEY) : null;
const recordVersion = record => record ? JSON.stringify([record.user.id, record.revision, record.state, record.outbox]) : '';
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
    ? navigator.locks.request('effeerre-registro-archive', run)
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
async function localSet(value) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['records', 'meta'], 'readwrite');
      transaction.objectStore('records').put(value, value.user.id);
      transaction.objectStore('meta').put(value.user.id, 'active');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('Il telefono non ha salvato la copia locale. Libera spazio e riprova.'));
      transaction.onabort = transaction.onerror;
    });
  } finally { db.close(); }
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
async function api(method, body) {
  if (navigator.onLine === false) {
    const error = new Error('Sei offline: la copia sul telefono è conservata e verrà sincronizzata quando torni online.');
    error.offline = true; throw error;
  }
  let response;
  const capability = runtime.deviceToken ? await deviceCapability() : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(runtime.apiUrl, {
      method, credentials: capability ? 'omit' : 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', ...(capability ? { Authorization: `EFFEERREDevice ${capability}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    const failure = new Error('Connessione assente: la copia sul telefono è conservata e verrà sincronizzata quando torni online.');
    failure.offline = true; throw failure;
  } finally { clearTimeout(timeout); }
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('Il servizio non ha risposto correttamente. Riprova tra poco: non occorrono credenziali di accesso.');
  let result;
  try { result = await response.json(); } catch { throw new Error('Il server ha restituito una risposta incompleta. Riprova.'); }
  if (!response.ok) {
    const error = new Error(result.error || 'Sincronizzazione non completata.');
    error.status = response.status; throw error;
  }
  return result;
}
function makePending(state) {
  const outbox = active.outbox || { state: structuredClone(state), baseRevision: active.revision, requestId: crypto.randomUUID() };
  active = { ...active, state: structuredClone(state), pending: true, outbox };
}
async function reconcile(source) {
  const next = reconcileTripTariffs(active.state);
  if (JSON.stringify(next) === JSON.stringify(active.state)) return;
  makePending(next);
  await localSet(active);
  try { await flush(source); }
  catch (error) { if (!error.offline && error.status !== 503) throw error; }
}
async function loadRecord(options = {}, source = 'load') {
  let local = await localGet();
  let remote;
  try { remote = await api('GET'); }
  catch (error) {
    if (local && error.offline && !options.preferRemote && !options.requireOnline) {
      active = { ...local, state: validateState(local.state) }; blocked = false;
      status({ status: 'offline', message: 'Modalità offline · copia salvata sul telefono' });
      publish(source);
      return structuredClone(active);
    }
    status({ status: 'error', message: error.message }); throw error;
  }
  remote.state = validateState(remote.state);
  if (!remote.user?.id || !Number.isSafeInteger(remote.revision)) throw new Error('Il server non ha identificato il tuo registro. Riprova.');
  if (local?.user.id !== remote.user.id) local = await localGet(remote.user.id);
  blocked = false;
  if (local?.user.id === remote.user.id && local.pending && !options.preferRemote) {
    active = local;
    try { await flush(source); await reconcile(source); }
    catch (error) { if (error.status === 401) throw error; }
    publish(source);
    return structuredClone(active);
  }
  active = { state: remote.state, revision: remote.revision, user: remote.user, updatedAt: remote.updatedAt, pending: false, outbox: null };
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
      const target = active.outbox || { state: structuredClone(active.state), baseRevision: active.revision, requestId: active.requestId || crypto.randomUUID() };
      // An unacknowledged request is immutable. Later offline edits wait behind it.
      active.outbox = target;
      await localSet(active);
      const remote = await api('POST', { ...target, expectedUserId: active.user.id });
      const acknowledged = validateState(remote.state);
      const caughtUp = JSON.stringify(active.state) === JSON.stringify(target.state);
      active = { ...active, state: caughtUp ? acknowledged : active.state, revision: remote.revision,
        updatedAt: remote.updatedAt, pending: !caughtUp,
        outbox: caughtUp ? null : { state: structuredClone(active.state), baseRevision: remote.revision, requestId: crypto.randomUUID() } };
      await localSet(active);
    }
    status({ status: 'synced', message: 'Dati salvati online' });
    publish(source); announce();
  } catch (error) {
    blocked = error.status === 409;
    status({ status: blocked ? 'conflict' : error.offline ? 'offline' : 'pending', message: error.message });
    error.pendingState = structuredClone(active.state);
    publish(source);
    throw error;
  }
}
export function saveState(value) {
  const state = reconcileTripTariffs(validateState(value));
  const expectedVersion = recordVersion(active);
  return enqueue(async () => {
    if (!active) throw new Error('Apri prima il registro.');
    if (blocked) {
      const error = new Error('La sincronizzazione è sospesa per un aggiornamento su un altro dispositivo. Esporta la copia locale dal profilo prima di ricaricare i dati online.');
      error.pendingState = structuredClone(state); throw error;
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
    try { await flush('save'); }
    catch (error) { if (!error.offline && error.status !== 503) throw error; }
    announce();
    return structuredClone(active);
  });
}
export function syncPending() {
  return enqueue(async () => {
    if (blocked) throw new Error('Sono presenti modifiche online più recenti. Esporta la copia locale e ricarica i dati online dal profilo.');
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/LTS-Registro-Viaggi/effeerre/sw.js', { scope: "/LTS-Registro-Viaggi/effeerre/" }).catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
