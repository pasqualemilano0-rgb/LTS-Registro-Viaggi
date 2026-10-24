/* Only fixed LTS reminder content is displayed. Push data never supplies URLs. */
(() => {
  const TYPES = new Set(['trip_14', 'trip_18', 'monthly', 'test']);
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  function info(payload) {
    const valid = payload && typeof payload === 'object' && !Array.isArray(payload)
      && Object.keys(payload).every(key => key === 'kind' || key === 'date')
      && TYPES.has(payload.kind) && date(payload.date);
    const kind = valid ? payload.kind : 'notice';
    const day = valid ? payload.date : new Date().toISOString().slice(0, 10);
    const monthly = kind === 'monthly';
    return {
      kind, day, section: monthly ? 'register' : 'insert',
      title: kind === 'test' ? 'Prova notifiche LTS' : monthly ? 'Resoconto di fine mese' : 'LTS Registro Viaggi',
      body: kind === 'test' ? 'Le notifiche LTS sono attive su questo dispositivo.'
        : monthly ? 'Carica i viaggi di oggi e invia il resoconto all’ufficio competente.'
        : 'Ricordati di inserire i viaggi effettuati nel registro LTS.',
    };
  }
  self.addEventListener('push', event => {
    event.waitUntil((async () => {
      let payload = null;
      try { payload = event.data?.json() ?? null; } catch { /* Display a fixed fallback, never a silent push. */ }
      const message = info(payload);
      const scope = new URL(self.registration.scope);
      const icon = new URL('assets/icon-192.png', scope).href;
      await self.registration.showNotification(message.title, {
        body: message.body, icon, badge: icon,
        tag: 'lts-' + message.kind + '-' + message.day,
        renotify: false,
        data: { kind: message.kind, date: message.day },
      });
    })());
  });
  self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
      const message = info(event.notification.data);
      const scope = new URL(self.registration.scope);
      const target = new URL(scope.href);
      target.hash = message.section;
      const allowed = new Set([scope.pathname, scope.pathname + 'index.html',
        scope.pathname + 'shell.html', scope.pathname + 'shell']);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
      for (const client of windows) {
        let address;
        try { address = new URL(client.url); } catch { continue; }
        if (address.origin !== scope.origin || !allowed.has(address.pathname)) continue;
        // Avoid reloading a trip form. The app handles the scoped message and
        // retains the same draft it already preserves across normal tab changes.
        client.postMessage({ type: 'LTS_REMINDER_OPEN', section: message.section,
          month: message.kind === 'monthly' ? message.day.slice(0, 7) : null });
        await client.focus();
        return;
      }
      await self.clients.openWindow(target.href);
    })());
  });
})();
