# ASSISTENTE LOGISTICA — piano implementazione sicura

**Configurazione approvata:** nome ASSISTENTE LOGISTICA; interfaccia minimal; interazione guidata (guided); moduli trip, customers, rates, ports. Nessuna chat generativa o comando vocale richiesti per la prima versione.

## Obiettivo UX autista
Un solo pulsante **INSERISCI VIAGGIO**. Sequenza:
1. Container: inserimento e validazione locale; non richiedere nuovamente dati già presenti nella bozza.
2. Cliente: barra di ricerca con `combinedTripCustomerChoices` e `filterTripCustomerChoices` già presenti nell'app; risultati filtrati per i permessi della sessione, distinguendo eventuali sedi.
3. Cliente assente: predisporre richiesta alla centrale, evitando duplicati. L'autista invia esplicitamente; conservare bozza e container; stato in attesa visibile senza bloccare altre funzioni.
4. Centrale: admin autenticato con MFA verifica richiesta, crea/associa cliente tramite procedure server esistenti, assegna tariffa autorizzata per cliente+destinazione; audit. Non creare clienti automaticamente.
5. Autista: aggiornamento stato approvazione, tariffa solo se verificata e autorizzata, riepilogo e conferma esplicita del viaggio. Il salvataggio deve riutilizzare il percorso e le validazioni esistenti.

## Moduli e confini
- **trip:** `shared/domain.mjs` (validazione e `createTrip`) e editor esistente in `app.mjs`. Mai scrivere direttamente in cache o database dal wizard.
- **customers:** directory combinata personale/aziendale, rispettando ownership e visibilità; richiesta nuovi clienti solo tramite endpoint autenticato e autorizzato.
- **rates:** `findTariff` e tariffe aziendali già presenti, senza inventare prezzi; gestione tariffa mancante tramite amministratore.
- **ports:** navigazione alla sezione `/porti/` esistente, senza duplicare booking, token o servizi.
- **config:** un solo oggetto dichiarativo con nome, stile, modalità, moduli; non dare accesso a dati tramite flag client.

## Architettura di sicurezza
- Feature flag OFF per default, attivabile prima solo per autisti pilota autenticati.
- Il frontend non trasporta token a modelli IA e non memorizza segreti. Verifica sessione e ruoli lato server a ogni richiesta.
- API richieste: create/list/status/approve/reject con idempotency key, autorizzazione per record, validazione server-side, anti-duplicati e audit. Admin MFA obbligatoria per approvazione e tariffe.
- Supabase RLS/permessi: driver può leggere solo richieste proprie e clienti autorizzati; admin può gestire le richieste secondo il proprio ruolo. Nessuna service-role key nel browser.
- Eventuali notifiche push non devono contenere informazioni riservate; fallback a polling moderato. Nessuna richiesta fantasma quando offline.
- Errori e timeout: bozza conservata, nessuna scrittura silenziosa; app principale sempre funzionante.
- Evitare modifiche ai meccanismi di login, service worker e sincronizzazione finché non sono stati verificati.

## Piano per PR incrementali
1. **UI minimal e configurazione**: rinomina e schermata guidata isolata, test accessibilità mobile e validazione container. Nessuna dipendenza da backend.
2. **Contesto autorizzato read-only**: adapter dalla sessione LTS verificata, ricerca clienti reali e tariffe, test isolamento tra account. Feature flag disattivo.
3. **Richieste cliente**: definizione schema/migrazione con RLS, API autorizzata, idempotenza, notifiche/stati e interfaccia amministratore; test negazione driver/admin e duplicati.
4. **Viaggio completo**: riuso editor/validazione/salvataggio esistenti, controllo tariffa e conferma, test regressione su modifica viaggio, offline e riapertura app.
5. **Porti e rollout**: collegamento a porti esistenti, pilota con pochi utenti, osservabilità, rollback e attivazione graduale.

## Criteri di accettazione / gate di rilascio
- Nessun cambiamento alla produzione durante la sola pianificazione.
- Test Node di logica e integrazione, CI verde, controllo manuale mobile, 404 GitHub Pages risolto e pagina realmente raggiungibile.
- Sessione persistente; nessuna pagina bianca in riapertura; nessun accesso cross-driver; admin MFA obbligatoria.
- Nessun viaggio o cliente duplicato; tariffa mai inventata; richiesta cliente realmente tracciata; feedback esplicito all'autista.
- Revisione sicurezza e merge solo dopo QA. Se il gate fallisce, rollback tramite feature flag.

## Stato reale
Questo documento è un piano, **non** un'integrazione già operativa. Il prototipo `/copilota/` usa clienti fittizi e non invia richieste. La disponibilità pubblica di GitHub Pages va verificata separatamente.
