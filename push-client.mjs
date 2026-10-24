const TEST_COOLDOWN_MS = 30_000;

function appleMobile(navigator) {
  return /iPad|iPhone|iPod/u.test(navigator?.userAgent || '')
    || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
}

export function detectPushEnvironment(environment = globalThis) {
  const navigator = environment.navigator;
  const installed = navigator?.standalone === true
    || environment.matchMedia?.('(display-mode: standalone)')?.matches === true;
  if (appleMobile(navigator) && !installed) return {
    supported: false, installRequired: true,
    message: 'Su iPhone apri LTS in Safari, scegli Condividi → Aggiungi alla schermata Home, poi apri l’icona LTS.',
  };
  if (!environment.isSecureContext || !navigator?.serviceWorker
      || !environment.Notification || !environment.PushManager) return {
    supported: false, installRequired: false,
    message: 'Le notifiche richiedono iOS 16.4 o successivo e LTS aggiunta alla schermata Home. Aggiorna iPhone se necessario.',
  };
  return { supported: true, installRequired: false, message: '' };
}

export function applicationServerKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{87}$/u.test(value))
    throw new Error('Configurazione notifiche non disponibile.');
  const decoded = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '=');
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Configurazione notifiche non disponibile.');
  return bytes;
}

function timezone(environment) {
  try { return environment.Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; }
  catch { return 'Europe/Rome'; }
}

function subscriptionValue(subscription) {
  return typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription;
}

function waitForRegistration(environment, timeoutMs = 15_000) {
  let timer;
  return Promise.race([
    environment.navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      timer = environment.setTimeout(() => reject(new Error('Preparazione dell’app non completata. Riapri LTS e riprova.')), timeoutMs);
      timer?.unref?.();
    }),
  ]).finally(() => environment.clearTimeout(timer));
}

/** Permission/subscription work starts only from enable(), called by a click. */
export function createPushController({ apiRequest, onChange = () => {}, notify = () => {}, environment = globalThis } = {}) {
  if (typeof apiRequest !== 'function') throw new TypeError('apiRequest required');
  const support = detectPushEnvironment(environment);
  const clock = () => environment.performance?.now?.() ?? Date.now();
  let registration = null, subscription = null, publicKey = null, cooldownTimer = null;
  const state = {
    supported: support.supported, ready: false, busy: false, enabled: false,
    permission: environment.Notification?.permission || 'default',
    message: support.message || 'Controllo dei promemoria…', error: false,
    timezone: timezone(environment), cooldown: false,
  };
  const emit = () => onChange({ ...state });
  const failure = message => { state.message = message; state.error = true; emit(); };
  const payload = action => ({
    action, subscription: subscriptionValue(subscription),
    timezone: timezone(environment), appUrl: registration.scope,
  });
  let nextTestAt = 0;
  function cooldown(milliseconds = TEST_COOLDOWN_MS) {
    const remaining = Math.max(0, Math.min(TEST_COOLDOWN_MS, milliseconds));
    if (cooldownTimer !== null) environment.clearTimeout(cooldownTimer);
    nextTestAt = clock() + remaining;
    state.cooldown = remaining > 0;
    if (remaining > 0) {
      cooldownTimer = environment.setTimeout(() => {
        cooldownTimer = null; state.cooldown = false; emit();
      }, remaining);
      cooldownTimer?.unref?.();
    }
  }
  async function initialize() {
    emit();
    if (!state.supported || state.busy) return;
    state.busy = true; state.error = false; emit();
    try {
      const [config, ready] = await Promise.all([apiRequest('GET'), waitForRegistration(environment)]);
      if (!config?.ready || !config?.available || typeof ready?.pushManager?.getSubscription !== 'function') {
        state.ready = false; state.message = 'Servizio promemoria non disponibile. Riapri questa sezione tra poco.'; return;
      }
      publicKey = applicationServerKey(config.publicKey);
      registration = ready;
      subscription = await registration.pushManager.getSubscription();
      state.permission = environment.Notification.permission;
      state.enabled = Boolean(subscription && config.enabled && state.permission === 'granted');
      state.ready = true;
      if (state.enabled && typeof config.timezone === 'string') state.timezone = config.timezone;
      state.message = state.permission === 'denied'
        ? 'Le notifiche sono bloccate. Consentile nelle Impostazioni iPhone → Notifiche → LTS Registro Viaggi.'
        : state.enabled ? 'Promemoria attivi su questo dispositivo.' : 'Premi Attiva notifiche e consenti gli avvisi sul telefono.';
      if (state.enabled && config.lastTestAt) {
        const previous = typeof config.lastTestAt === 'number' ? config.lastTestAt : Date.parse(config.lastTestAt);
        const remaining = TEST_COOLDOWN_MS - (Date.now() - previous);
        if (Number.isFinite(remaining) && remaining > 0) cooldown(remaining);
      }
    } catch {
      state.ready = false; state.message = 'Non riesco a verificare i promemoria. Controlla la connessione e riapri questa sezione.'; state.error = true;
    } finally { state.busy = false; emit(); }
  }
  async function enable() {
    if (!state.ready || state.busy) return;
    if (environment.Notification.permission === 'denied') {
      failure('Le notifiche sono bloccate. Consentile nelle Impostazioni iPhone → Notifiche → LTS Registro Viaggi.'); return;
    }
    state.busy = true; state.error = false; emit();
    try {
      // Do not await a network request or service-worker operation before this
      // call: Safari requires the explicit button activation to still be active.
      const permission = environment.Notification.permission === 'granted'
        ? 'granted' : await environment.Notification.requestPermission();
      state.permission = permission;
      if (permission !== 'granted') {
        state.message = permission === 'denied'
          ? 'Notifiche non consentite. Puoi abilitarle nelle Impostazioni iPhone → Notifiche → LTS Registro Viaggi.'
          : 'Nessun consenso dato. I promemoria restano disattivati.'; return;
      }
      subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      const result = await apiRequest('POST', payload('subscribe'));
      if (result?.ok !== true || result?.enabled !== true) throw new Error('not confirmed');
      state.enabled = true; state.timezone = timezone(environment);
      state.message = 'Promemoria attivi su questo dispositivo.';
      notify('Notifiche attivate.');
    } catch {
      // Retain a newly created browser subscription: retrying binds that same
      // endpoint, rather than losing the caller’s still-valid permission.
      state.message = 'Attivazione non completata. Controlla la connessione e premi Attiva notifiche per riprovare.';
      state.error = true;
    } finally { state.busy = false; emit(); }
  }
  async function test() {
    if (!state.ready || !state.enabled || state.busy) return;
    if (clock() < nextTestAt) { failure('Attendi 30 secondi prima di ripetere la prova.'); return; }
    if (environment.Notification.permission !== 'granted') {
      state.enabled = false; state.permission = environment.Notification.permission;
      failure('Consenti di nuovo le notifiche nelle Impostazioni iPhone.'); return;
    }
    state.busy = true; state.error = false; cooldown(); emit();
    try {
      const result = await apiRequest('POST', payload('test'));
      if (result?.ok !== true || result?.sent !== true) throw new Error('not confirmed');
      state.message = 'Prova inviata. Controlla le notifiche di iPhone.';
      notify('Notifica di prova inviata.');
    } catch {
      state.message = 'La prova non è stata confermata. Controlla la connessione e riprova tra 30 secondi.';
      state.error = true;
    } finally { state.busy = false; emit(); }
  }
  async function disable() {
    if (!state.ready || state.busy || !subscription) return;
    state.busy = true; state.error = false; emit();
    try {
      const result = await apiRequest('POST', payload('unsubscribe'));
      if (result?.ok !== true || result?.enabled !== false) throw new Error('not confirmed');
      state.enabled = false;
      try { await subscription.unsubscribe(); subscription = null; }
      catch { /* Server revocation is already confirmed; the endpoint is inert. */ }
      state.message = 'Promemoria disattivati su questo dispositivo.';
      notify('Notifiche disattivate.');
    } catch {
      state.message = 'Disattivazione non confermata. Controlla la connessione e riprova: la registrazione è conservata.';
      state.error = true;
    } finally { state.busy = false; emit(); }
  }
  function destroy() {
    if (cooldownTimer !== null) environment.clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
  return { initialize, enable, test, disable, destroy, get state() { return { ...state }; } };
}

export function appendPushSettings(parent, { apiRequest, toast = () => {} } = {}) {
  const document = parent.ownerDocument;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const section = node('section', 'push-settings');
  section.setAttribute('aria-label', 'Promemoria');
  section.append(node('p', 'section-label', 'Promemoria'));
  section.append(node('p', 'profile-description', 'Ogni giorno alle 14:00 e alle 18:00. L’ultimo giorno del mese, alle 18:00, ricorda anche il resoconto per l’ufficio.'));
  const zone = node('p', 'profile-description');
  const status = node('p', 'device-link-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = node('div', 'profile-menu');
  const activate = node('button', 'secondary-button full', 'Attiva notifiche');
  const test = node('button', 'secondary-button full', 'Prova notifica');
  const disable = node('button', 'secondary-button full', 'Disattiva notifiche');
  for (const button of [activate, test, disable]) { button.type = 'button'; actions.append(button); }
  section.append(zone, status, actions);
  parent.append(section);
  const controller = createPushController({ apiRequest, notify: toast, onChange(state) {
    status.textContent = state.message;
    status.className = state.error ? 'info-note danger' : 'device-link-status';
    zone.textContent = 'Fuso orario dei promemoria: ' + state.timezone;
    activate.disabled = !state.ready || state.busy || state.permission === 'denied';
    activate.textContent = state.enabled ? 'Aggiorna promemoria' : 'Attiva notifiche';
    test.disabled = !state.ready || !state.enabled || state.busy || state.cooldown;
    test.textContent = state.cooldown ? 'Attendi 30 secondi' : 'Prova notifica';
    disable.disabled = !state.ready || !state.enabled || state.busy;
    actions.hidden = !state.supported;
    section.setAttribute('aria-busy', String(state.busy));
  } });
  activate.addEventListener('click', () => controller.enable());
  test.addEventListener('click', () => controller.test());
  disable.addEventListener('click', () => controller.disable());
  void controller.initialize();
  return controller;
}
