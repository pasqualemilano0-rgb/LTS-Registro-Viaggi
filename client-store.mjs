import { validateState, reconcileTripTariffs, exportBackup } from '/LTS-Registro-Viaggi/shared/domain.mjs';
import { mergeStates, unionStates, resolveMergeStates } from '/LTS-Registro-Viaggi/shared/sync-merge.mjs';
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';
import * as account from '/LTS-Registro-Viaggi/account-access.mjs';
import * as realtime from '/LTS-Registro-Viaggi/realtime-client.mjs';

const DB_NAME = 'lts-registro-iphone-v1';
const listeners = new Set();
const stateListeners = new Set();
const CHANGE_KEY = 'lts-registro-record-changed-v1';
let active = null;
let accountOwner = null; // Only set after online verification of Supabase Auth.
let ownerEpoch = 0;
// The persisted baseline is deliberately separate from the editable active copy.
const baselines = new Map();
const recoveryCounts = new Map();
const RECOVERY_PREFIX = 'archive-recovery-v1:';
let queue = Promise.resolve();
let blocked = false;
let refreshing = false;
let lastStatus = { status: 'syncing', message: 'Apertura del registro…' };
let published = '';
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANGE_KEY) : null;
const recordVersion = record => record ? JSON.stringify(record) : '';
const lease = () => ({ owner: accountOwner, epoch: ownerEpoch });
function assertLease(expected) {
  if (expected.owner !== accountOwner || expected.epoch !== ownerEpoch || (expected.owner && (!account.isVerified() || (account.getAccountId && account.getAccountId() !== expected.owner)))) {
    const error = new Error('La sessione è cambiata. Accedi nuovamente: le copie sul dispositivo restano conservate.');
    error.code = 'LTS_OWNER_CHANGED'; throw error;
  }
}
function remember(owner, record) { baselines.set(owner, record ? structuredClone(record) : null); }
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
  const fingerprint = JSON.stringify([active.user.id, active.revision, active.pending, active.state, recoveryCounts.get(active.user.id) || 0]);
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
  // Web Locks reduce contention; the IndexedDB transaction remains the local guard.
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
async function localSet(value, { clearLinkIntent = false, expected = baselines.get(value.user.id) ?? null, queuedRecord = null, ownerLease = lease(), preserve = null } = {}) {
  assertLease(ownerLease);
  const candidate = structuredClone(value), owner = candidate.user.id;
  if (ownerLease.owner && owner !== ownerLease.owner) throw new Error('Il registro non appartiene all’account verificato.');
  let db;
  let current = null, recovery = null;
  try {
    db = await database();
    assertLease(ownerLease);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['records', 'meta'], 'readwrite');
      let guarded = false, ownerChanged = false;
      const meta = transaction.objectStore('meta');
      const records = transaction.objectStore('records');
      const keep = (reason, savedCandidate = candidate) => {
        const id = crypto.randomUUID();
        recovery = { id, owner, createdAt: Date.now(), reason, candidate: savedCandidate,
          baseline: expected ? structuredClone(expected) : null,
          ...(queuedRecord ? { queuedRecord: structuredClone(queuedRecord) } : {}) };
        meta.put(recovery, RECOVERY_PREFIX + owner + ':' + id);
      };
      const write = () => {
        try { assertLease(ownerLease); } catch { ownerChanged = true; transaction.abort(); return; }
        // Compare and write in ONE transaction: pre-reading in another transaction
        // loses offline edits when two tabs do not support Web Locks.
        if (recordVersion(current) !== recordVersion(expected)) { keep('concurrent-write'); return; }
        if (preserve) keep('confirmed-resolution', structuredClone(preserve));
        records.put(candidate, owner);
        // A Supabase account must never replace the old device archive pointer.
        // The previous archive remains separately recoverable.
        if (!accountOwner) meta.put(value.user.id, 'active');
        if (clearLinkIntent) meta.delete('device-link-intent-v1');
      };
      const recordRead = records.get(owner);
      recordRead.onsuccess = () => {
        current = recordRead.result || null;
        if (clearLinkIntent) { write(); return; }
        const read = meta.get('device-link-intent-v1'); read.onsuccess = () => {
          const intent = read.result;
          // IndexedDB serializes this guard with association setup even in
          // browsers without Web Locks and across tabs sharing this database.
          if (intent?.sourceUserId === value.user.id && intent.targetUserId !== value.user.id) {
            guarded = true; transaction.abort();
          } else write();
        };
      };
      transaction.oncomplete = () => {
        remember(owner, recovery?.reason === 'concurrent-write' ? current : candidate);
        if (recovery) recoveryCounts.set(owner, (recoveryCounts.get(owner) || 0) + 1);
        if (recovery?.reason === 'concurrent-write') {
          const error = new Error('Il registro è cambiato in un’altra scheda. La tua modifica è conservata nelle copie di recupero del Profilo; controllala prima di applicarla.');
          error.code = 'LTS_LOCAL_CONFLICT'; error.recoveryId = recovery.id;
          reject(error);
        } else resolve();
      };
      transaction.onerror = () => {
        const error = new Error(ownerChanged ? 'La sessione è cambiata: nessun registro è stato sostituito.' : guarded ? 'Il collegamento attende conferma. Premi Sincronizza adesso nel profilo: i dati del modulo sono conservati.' : 'Il telefono non ha salvato la copia locale. Libera spazio ed esporta i dati del modulo prima di riprovare.');
        if (ownerChanged) error.code = 'LTS_OWNER_CHANGED';
        reject(error);
      };
      transaction.onabort = transaction.onerror;
    });
    assertLease(ownerLease);
    active = candidate;
  } catch (error) {
    if (!error.code) error.code = 'LTS_LOCAL_STORAGE';
    if (ownerLease.owner === accountOwner && ownerLease.epoch === ownerEpoch && account.isVerified()) {
      if (error.code === 'LTS_LOCAL_STORAGE') {
        // A failed recovery write rolled back only this transaction. Another
        // tab's pending winner still exists and must remain visible as pending.
        try {
          const latest = await localGet(owner);
          assertLease(ownerLease); remember(owner, latest);
        } catch {
          assertLease(ownerLease);
          active = null; blocked = true;
          status({ status: 'error', message: error.message });
          throw error;
        }
      }
      active = structuredClone(baselines.get(owner) ?? null);
      blocked = Boolean(active?.conflict);
      if (error.code === 'LTS_LOCAL_CONFLICT') {
        status({ status: 'conflict', message: error.message }); publish('recovery'); announce();
      } else if (error.code === 'LTS_LOCAL_STORAGE') {
        status({ status: 'error', message: error.message }); publish('storage');
      }
    }
    throw error;
  } finally { db?.close(); }
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
  if (accountOwner && !endpoint) return account.archiveRequest(method, body);
  if (accountOwner && endpoint === '/api/device-link')
    throw new Error('Il collegamento tramite codice è disponibile solo per gli archivi dispositivo. Usa il tuo account per sincronizzare più telefoni.');
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
function newRequestState(state, record = active) {
  const value = structuredClone(state);
  if (runtime.deviceToken) return value;
  const unknown = unknownNoteIds(record);
  for (const trip of value.trips) if (trip.note === '' && unknown.has(trip.id)) delete trip.note;
  return value;
}
function pendingRecord(state, record = active) {
  const outbox = record.outbox || { state: newRequestState(state, record), baseRevision: record.revision, ...(record.baseState ? { baseState: structuredClone(record.baseState) } : {}), requestId: crypto.randomUUID() };
  return { ...record, state: structuredClone(state), pending: true, outbox };
}
function makePending(state) {
  active = pendingRecord(state);
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
  if (!account.isEnabled() || !accountOwner || !account.isVerified())
    throw new Error('Accesso al registro consentito solo dopo verifica credenziali.');
  // Never consult the global 'active' pointer for an authenticated account.
  const ownerLease = lease();
  let local = await localGet(accountOwner);
  assertLease(ownerLease);
  remember(ownerLease.owner, local);
  await recoveryEntries(ownerLease);
  let remote;
  try { remote = await api('GET'); }
  catch (error) {
    assertLease(ownerLease);
    if (local && (error.offline || [500, 502, 503, 504].includes(error.status)) && !options.preferRemote && !options.requireOnline) {
      active = { ...local, unknownNoteIds: [...unknownNoteIds(local)], state: validateState(local.state) }; blocked = Boolean(active.conflict);
      status({ status: 'offline', message: 'Modalità offline · copia salvata sul telefono' });
      publish(source);
      return structuredClone(active);
    }
    status({ status: 'error', message: error.message }); throw error;
  }
  assertLease(ownerLease);
  remote.state = validateState(remote.state);
  if (!remote.user?.id || !Number.isSafeInteger(remote.revision)) throw new Error('Il server non ha identificato il tuo registro. Riprova.');
  if (accountOwner && remote.user.id !== accountOwner)
    throw new Error('Il server ha restituito un registro diverso dall’account verificato. Nessun dato è stato caricato.');
  const intent = accountOwner ? null : runtime.deviceToken ? await linkIntent() : null;
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
    catch (error) { if (error.status === 401 || error.code) throw error; }
    publish(source);
    return structuredClone(active);
  }
  active = { state: remote.state, baseState: structuredClone(remote.state), revision: remote.revision, user: remote.user, updatedAt: remote.updatedAt, linked: Boolean(remote.linked || remote.user.linked || local?.linked), pending: false, outbox: null, conflict: null };
  await localSet(active, { ownerLease, preserve: options.preferRemote && local?.pending ? local : null });
  await reconcile(source);
  status({ status: active.pending ? 'pending' : 'synced', message: active.pending ? 'Aggiornamento tariffe salvato sul dispositivo · sincronizzazione in attesa' : 'Dati salvati online' });
  publish(source);
  return structuredClone(active);
}
export function loadState(options = {}) { return enqueue(() => loadRecord(options)); }

/** Switch archive only after a fresh verification with Supabase Auth.
 * Never merge the old device archive on first login. Import remains explicit.
 */
export function activateAccountFromSession() {
  return enqueue(async () => {
    const epoch = ownerEpoch;
    const identity = await account.verifySession();
    if (epoch !== ownerEpoch || !account.isVerified()) throw new Error('La sessione è cambiata. Accedi nuovamente.');
    const nextOwner = 'account:' + identity.user_id;
    // A pending local write may be resumed by the SAME verified account.
    // Only switching to a different identity must be blocked until a safe
    // backup/sync. Never discard the old account's unsynced data.
    if (accountOwner && accountOwner !== nextOwner && (active?.pending || blocked)) {
      throw new Error('Prima completa la sincronizzazione del registro account corrente. Le modifiche restano salvate.');
    }
    accountOwner = nextOwner; ownerEpoch++;
    active = null; blocked = false; published = '';
    return loadRecord({ requireOnline: true }, 'account');
  });
}
export function usingAccount() { return Boolean(accountOwner); }
/** Local-only, per-account editor scratchpad. It is NOT included in backups,
 * sync payloads or the public asset cache. A verified login gates read/write. */
const TRIP_EDITOR_DRAFT_PREFIX='trip-editor-v1:';
let editorDraftQueue=Promise.resolve();
function tripEditorDraftAction(mode,value=null){
 const owner=accountOwner;
 const ownerLease=lease();
 if(!owner||!account.isVerified())return Promise.reject(new Error('Accedi per recuperare la bozza del viaggio.'));
 if(mode==='write'&&JSON.stringify(value).length>10000)
  return Promise.reject(new Error('La bozza è troppo grande per essere conservata.'));
 const next=editorDraftQueue.then(async()=>{
  assertLease(ownerLease);
  if(accountOwner!==owner||!account.isVerified())throw new Error('Account cambiato: bozza non salvata.');
  const db=await database();
  try{
   assertLease(ownerLease);
   return await new Promise((resolve,reject)=>{
    const transaction=db.transaction('meta',mode==='read'?'readonly':'readwrite');
    const meta=transaction.objectStore('meta');
    const key=TRIP_EDITOR_DRAFT_PREFIX+owner;
    let stored=null;
    if(mode==='read'){const request=meta.get(key);request.onsuccess=()=>{stored=request.result||null;};}
    else if(mode==='delete')meta.delete(key);
    else meta.put(value,key);
    transaction.oncomplete=()=>{try{assertLease(ownerLease);resolve(stored);}catch(error){reject(error);}};
    transaction.onerror=transaction.onabort=()=>reject(new Error('Impossibile aggiornare la bozza locale. Verifica lo spazio del dispositivo.'));
   });
  }finally{db.close();}
 });
 editorDraftQueue=next.catch(()=>{});
 return next;
}
export function readTripEditorDraft(){return tripEditorDraftAction('read');}
export function saveTripEditorDraft(snapshot){return tripEditorDraftAction('write',snapshot);}
export function clearTripEditorDraft(){return tripEditorDraftAction('delete');}

// Legacy archives remain untouched under the original IndexedDB key. They are
// only visible to a freshly verified account owner using this browser profile.
async function legacyRecordForVerifiedAccount() {
  if (!accountOwner || !account.isVerified())
    throw new Error('Accedi prima al tuo account per recuperare il vecchio archivio.');
  const record = await localGet(); // original device pointer, NOT the account record
  if (!record?.user?.id || record.user.id.startsWith('account:')) return null;
  const state = validateState(record.state);
  const meaningful = state.trips.length || state.customers.length || state.tariffs.length ||
    state.profile.firstName || state.profile.lastName;
  return meaningful ? {record,state} : null;
}
export async function previewLegacyArchive() {
  const legacy = await legacyRecordForVerifiedAccount();
  if (!legacy) return null;
  const {record,state} = legacy;
  return {
    name: [state.profile.firstName,state.profile.lastName].filter(Boolean).join(' '),
    trips: state.trips.length,customers: state.customers.length,tariffs: state.tariffs.length,
    // Never expose an archive token, revision or local storage ID.
    hasData: true
  };
}
export async function exportLegacyBackup() {
  const legacy = await legacyRecordForVerifiedAccount();
  if (!legacy) throw new Error('Nessun archivio precedente disponibile su questo dispositivo.');
  return exportBackup(legacy.state);
}
const LEGACY_IMPORTED_PREFIX='lts-legacy-imported-v1:';
export function hasImportedLegacyArchive() {
  if (!accountOwner || !account.isVerified()) return false;
  try { return localStorage.getItem(LEGACY_IMPORTED_PREFIX+accountOwner)==='yes'; }
  catch { return false; }
}
export async function importLegacyArchive() {
  // The caller has explicitly confirmed this is their old register.
  const legacy = await legacyRecordForVerifiedAccount();
  if (!legacy) throw new Error('Non è stato trovato un vecchio archivio su questo dispositivo.');
  await account.verifySession(); // fail closed if access was revoked or is offline
  if (!active || !accountOwner || active.user.id!==accountOwner)
    throw new Error('Il registro account non è pronto.');
  if (active.pending || blocked || active.conflict)
    throw new Error('Sincronizza o risolvi prima le modifiche del registro account.');
  // Only merge the validated snapshot after authentication; never overwrite
  // the old device entry. Conflicting account data are not resolved silently.
  const existing = validateState(active.state);
  const emptyTarget = existing.trips.length===0 && existing.customers.length===0 &&
    existing.tariffs.length===0 && !existing.profile.firstName && !existing.profile.lastName;
  let combined;
  try { combined = unionStates(existing,legacy.state,{prefer:emptyTarget?'local':null}); }
  catch { throw new Error('Sono presenti dati in conflitto: nessun dato è stato sovrascritto. Esporta entrambi i backup prima di procedere.'); }
  const result = await saveState(combined);
  try { localStorage.setItem(LEGACY_IMPORTED_PREFIX+accountOwner,'yes'); }catch{}
  return result;
}

/** An identity revoked server-side must disappear from the screen immediately.
 * Its unsynchronized offline copy is retained under its account key for later
 * recovery by the same verified account, never shown to the next login. */
export function lockRevokedAccount() {
  ownerEpoch++;
  accountOwner = null;
  active = null; blocked = false; published = '';
  status({status:'error',message:'Sessione account revocata. Accedi nuovamente.'});
}
export function leaveAccountView() {
  if (active?.pending || blocked)
    throw new Error('Il registro contiene modifiche non sincronizzate. Sincronizza o esporta un backup prima di uscire.');
  ownerEpoch++; accountOwner = null;
  active = null; blocked = false; published = '';
}

async function flush(source = 'background') {
  if (!active?.pending || blocked) return;
  const ownerLease = lease();
  status({ status: 'syncing', message: 'Salvataggio online…' });
  try {
    while (active.pending) {
      const target = active.outbox || { state: newRequestState(active.state), baseRevision: active.revision, ...(active.baseState ? { baseState: structuredClone(active.baseState) } : {}), requestId: active.requestId || crypto.randomUUID() };
      // An unacknowledged request is immutable. Later offline edits wait behind it.
      active.outbox = target;
      await localSet(active, { ownerLease });
      const queuedRecord = structuredClone(active);
      const payload = { ...target, expectedUserId: active.user.id };
      // The old cookie/account endpoint keeps its existing revision-only protocol.
      if (!runtime.deviceToken) delete payload.baseState;
      const remote = await api('POST', payload);
      assertLease(ownerLease);
      if (remote.user?.id !== ownerLease.owner || !Number.isSafeInteger(remote.revision)) throw new Error('Il server non ha confermato il registro atteso. La richiesta locale resta conservata.');
      const acknowledged = validateState(remote.state);
      const caughtUp = JSON.stringify(validateState(active.state)) === JSON.stringify(validateState(target.state));
      let nextState;
      try { nextState = caughtUp ? acknowledged : mergeStates(target.state, active.state, acknowledged); }
      catch (error) {
        active = { ...active, revision: remote.revision, baseState: acknowledged, outbox: null,
          updatedAt: remote.updatedAt, conflict: { paths: error.paths || [], baseState: structuredClone(target.state), remoteState: acknowledged, revision: remote.revision } };
        await localSet(active, { ownerLease, queuedRecord });
        error.status = 409; throw error;
      }
      active = { ...active, state: nextState, baseState: structuredClone(acknowledged), revision: remote.revision,
        linked: Boolean(remote.linked || remote.user?.linked || active.linked), updatedAt: remote.updatedAt, pending: !caughtUp, conflict: null,
        outbox: caughtUp ? null : { state: structuredClone(nextState), baseState: structuredClone(acknowledged), baseRevision: remote.revision, requestId: crypto.randomUUID() } };
      await localSet(active, { ownerLease, queuedRecord });
    }
    status({ status: 'synced', message: 'Dati salvati online' });
    publish(source); announce();
  } catch (error) {
    assertLease(ownerLease);
    if (error.code) throw error;
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
  const visible = accountOwner && account.isVerified() && active?.user.id === accountOwner;
  const record = visible ? active : null;
  const pendingSnapshots = record?.pending ? 1 + (record.outbox && JSON.stringify(record.outbox.state) !== JSON.stringify(record.state) ? 1 : 0) : 0;
  return { linked: Boolean(record?.linked), pending: Boolean(record?.pending), conflict: Boolean(visible && (blocked || record.conflict)),
    recoveryCount: visible ? recoveryCounts.get(accountOwner) || 0 : 0,
    revision: record?.revision ?? null, updatedAt: record?.updatedAt ?? null, pendingSnapshots,
    conflictPathsCount: record?.conflict?.paths?.length || 0, status: lastStatus.status };
}
async function recoveryEntries(ownerLease = lease()) {
  assertLease(ownerLease);
  if (!ownerLease.owner) throw new Error('Accedi per recuperare le copie del tuo registro.');
  const db = await database();
  try {
    assertLease(ownerLease);
    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly'), values = [];
      const prefix = RECOVERY_PREFIX + ownerLease.owner + ':';
      const read = tx.objectStore('meta').openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      read.onsuccess = () => { const cursor = read.result; if (cursor) { if (cursor.value.owner === ownerLease.owner) values.push(cursor.value); cursor.continue(); } };
      tx.oncomplete = () => resolve(values);
      tx.onerror = tx.onabort = () => reject(new Error('Impossibile leggere le copie di recupero sul dispositivo.'));
    });
    assertLease(ownerLease);
    recoveryCounts.set(ownerLease.owner, entries.length);
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  } finally { db.close(); }
}
export async function listRecoveryCopies() {
  return (await recoveryEntries()).map(({ id, createdAt, reason, candidate, queuedRecord }) => ({
    id, createdAt, reason, profile: structuredClone(candidate.state.profile),
    trips: candidate.state.trips.length, customers: candidate.state.customers.length,
    pending: Boolean(candidate.pending || queuedRecord?.pending)
  }));
}
async function recoveryCopy(id, ownerLease) {
  const copy = (await recoveryEntries(ownerLease)).find(value => value.id === id);
  if (!copy) throw new Error('Copia di recupero non disponibile per questo account.');
  return copy;
}
export async function exportRecoveryCopy(id) {
  const copy = await recoveryCopy(id, lease());
  return JSON.stringify({ ...JSON.parse(exportBackup(copy.candidate.state)), recovery: { version: 1, ...copy } }, null, 2);
}
export function applyRecoveryCopy(id, { confirm = false, prefer = null } = {}) {
  const ownerLease = lease();
  return enqueue(async () => {
    assertLease(ownerLease);
    if (confirm !== true) throw new Error('Conferma esplicitamente l’applicazione della copia di recupero.');
    if (prefer !== null && !['local', 'remote'].includes(prefer)) throw new Error('Scelta di recupero non valida.');
    const copy = await recoveryCopy(id, ownerLease);
    const current = await localGet(ownerLease.owner);
    assertLease(ownerLease);
    if (!current) throw new Error('Apri prima il registro account.');
    if (current.conflict) throw new Error('Risolvi prima il conflitto di sincronizzazione del registro.');
    const base = copy.baseline?.state || copy.candidate.baseState;
    if (!base) throw new Error('La copia non contiene una base verificabile. Esporta il backup prima di importare i dati da conservare.');
    // Independent changes merge automatically. A preference is used only after
    // the caller has explicitly confirmed which side wins a real conflict.
    const merged = prefer ? resolveMergeStates(base, copy.candidate.state, current.state, { prefer })
      : mergeStates(base, copy.candidate.state, current.state);
    remember(ownerLease.owner, current);
    await localSet(pendingRecord(merged, current), { expected: current, ownerLease });
    blocked = false;
    try { await flush('recovery'); }
    catch (error) { if (!error.offline && ![500, 502, 503, 504].includes(error.status)) throw error; }
    publish('recovery'); announce();
    // Keep the original recovery until the user explicitly deletes it.
    return structuredClone(active);
  });
}
export function deleteRecoveryCopy(id, { confirm = false } = {}) {
  const ownerLease = lease();
  return enqueue(async () => {
    assertLease(ownerLease);
    if (confirm !== true) throw new Error('Conferma esplicitamente l’eliminazione della copia di recupero.');
    await recoveryCopy(id, ownerLease);
    const db = await database();
    try {
      assertLease(ownerLease);
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete(RECOVERY_PREFIX + ownerLease.owner + ':' + id);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(new Error('La copia di recupero non è stata eliminata. Riprova.'));
      });
    } finally { db.close(); }
    await recoveryEntries(ownerLease);
    publish('recovery'); announce();
  });
}
function requireDeviceLink() {
  if (accountOwner) throw new Error('I dispositivi che usano lo stesso account condividono già il proprio registro. Non usare i codici degli archivi dispositivo.');
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
    const ownerLease = lease();
    const remote = await api('GET');
    assertLease(ownerLease);
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
    const ownerLease = lease();
    if (!['local', 'remote'].includes(choice)) throw new Error('Scegli quale copia conservare.');
    const remote = await api('GET');
    assertLease(ownerLease);
    if (remote.user?.id !== active?.user.id || remote.revision !== expectedRevision) throw new Error('Il registro online è cambiato ancora. Controlla nuovamente le due copie prima di scegliere.');
    const checked = validateState(remote.state);
    const base = active.conflict?.baseState || active.outbox?.baseState || active.baseState;
    if (!base) throw new Error('Questa vecchia coda non contiene una base verificabile. Esporta la copia locale e usa Ricarica dati online prima di importare le modifiche da conservare.');
    const merged = resolveMergeStates(base, active.state, checked, { prefer: choice });
    const preserve = structuredClone(active);
    const pending = JSON.stringify(merged) !== JSON.stringify(checked);
    active = { ...active, state: merged, baseState: structuredClone(checked), revision: remote.revision, updatedAt: remote.updatedAt, pending, conflict: null,
      outbox: pending ? { state: structuredClone(merged), baseState: structuredClone(checked), baseRevision: remote.revision, requestId: crypto.randomUUID() } : null };
    blocked = false; await localSet(active, { ownerLease, preserve });
    if (active.pending) await flush('resolve');
    status({ status: 'synced', message: 'Scelta confermata · archivio condiviso aggiornato' });
    publish('resolve'); announce(); return structuredClone(active);
  });
}
export function saveState(value) {
  if (!account.isEnabled() || !accountOwner || !account.isVerified())
    throw new Error('Accedi con le tue credenziali per salvare nel registro.');
  const state = reconcileTripTariffs(validateState(value));
  const ownerLease = lease();
  const previous = active ? structuredClone(active) : null;
  const expected = structuredClone(baselines.get(accountOwner) ?? null);
  return enqueue(async () => {
    assertLease(ownerLease);
    if (!previous) throw new Error('Apri prima il registro.');
    if (runtime.deviceToken && await linkIntent()) {
      throw new Error('Il collegamento tra dispositivi attende conferma. Premi Sincronizza adesso nel profilo prima di salvare: i dati del modulo sono conservati.');
    }
    await localSet(pendingRecord(state, previous), { expected, ownerLease });
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
let lastPoll = 0;
function pollArchive() {
  const interval = realtime.realtimeHealthy?.() ? 120000 : 8000;
  if (Date.now() - lastPoll < interval) return;
  lastPoll = Date.now(); refreshSoon();
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
window.addEventListener('focus', refreshSoon);
window.addEventListener('pageshow', refreshSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSoon(); });
// Near-live while a verified account is open and online; background tabs do not poll.
setInterval(pollArchive, 2000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/LTS-Registro-Viaggi/sw.js', { scope: "/LTS-Registro-Viaggi/" }).catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
