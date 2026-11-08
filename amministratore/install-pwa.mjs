/* Standalone administrator PWA: only controls installation and its offline page.
 * Authentication, MFA and all records remain in the existing online-only app.
 */
const installButton = document.getElementById('install-admin');
const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
let pendingPrompt = null;

if (installButton && !standalone()) {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    pendingPrompt = null;
    installButton.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Manual installation remains available through the browser menu.
    }
  });

  window.addEventListener('appinstalled', () => {
    pendingPrompt = null;
    installButton.hidden = true;
  });
}

// Dedicated admin worker has a narrower scope than the driver's root worker.
// It never precaches session tokens, records, API responses or login pages.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    const script = new URL('./sw.js', import.meta.url);
    const scope = new URL('./', import.meta.url).pathname;
    void navigator.serviceWorker.register(script, { scope }).catch(() => {
      // Installation may still be available via "Aggiungi a schermata Home".
    });
  }, { once: true });
}
