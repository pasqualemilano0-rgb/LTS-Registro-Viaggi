# LTS Registro Viaggi

Applicazione aziendale per la registrazione dei viaggi, la gestione di clienti e tariffe e la consultazione dei programmi portuali.

**Accesso all'applicazione:** https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/

**Area aziendale riservata:** https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/amministratore/

**Informativa privacy:** https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/privacy/

## Funzioni disponibili

- Registro dei viaggi e riepiloghi mensili.
- Gestione di clienti, tariffe e servizi aggiuntivi.
- Consultazione operativa della sezione Porti.
- Sincronizzazione e backup tramite le funzioni dell'app.
- Report aziendali accessibili soltanto agli utenti autorizzati.

Il sito contiene l'interfaccia pubblica dell'applicazione. I dati personali, gli archivi degli autisti e le funzioni riservate richiedono autenticazione e autorizzazioni lato server.

Le informazioni sui terminal portuali sono indicative: per l'accettazione di un carico fanno fede i sistemi ufficiali dei terminal.

Per assistenza, utilizzare i riferimenti indicati nell'applicazione o nell'informativa privacy.


## Miglioramenti dashboard e qualità

- **Filtri operativi per l'amministratore:** indirizzi mancanti, possibili duplicati, clienti già condivisi e viaggi con tariffe o extra incompleti.
- **Certificazione Google Maps rapida:** azione dalla card cliente personale; ogni unificazione richiede revisione e conferma esplicita, mantenendo audit e viaggi storici.
- **Card compatte e accessibili:** stessa identità grafica LTS su smartphone e desktop.
- **Trasparenza:** se il confronto con l'elenco condiviso non è disponibile, la dashboard non dichiara il cliente certificato.

Il [piano completo per raggiungere il livello 10/10](./PIANO-LTS-10-10.md) distingue gli interventi già realizzati dai test su dispositivi reali e sui servizi protetti ancora necessari.

## LTS Control Center — supporto gratuito

- **Pannello di stato:** https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/status/
- **Monitor pubblico:** [GitHub Actions](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/actions/workflows/lts-uptime-monitor.yml). Verifica ogni ora sito, area amministratore (solo pagina di login), bundle JavaScript e preflight dell'API login.
- Tutti i controlli sono di sola lettura; nessuna password, archivio clienti, autenticazione reale o dati degli autisti viene richiesto. Non viene usato il repository privato o un servizio esterno a pagamento.
- I controlli GitHub programmati possono essere ritardati; il pannello mostra **non verificato** o **dati non recenti** quando mancano prove aggiornate. Una pagina raggiungibile non dimostra che login e salvataggi funzionino.
- Per ricevere email sui workflow falliti, attivare le notifiche GitHub Actions nelle [impostazioni notifiche](https://github.com/settings/notifications). Il monitor non invia messaggi autonomamente.

### Installazione e notifiche Control Center

- Il [Control Center](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/status/) dispone di un **manifest PWA separato** e di un service worker limitato alla cartella `status/`, senza intercettare l'app autisti o l'area amministratore.
- Su Android aprire la pagina con Chrome e scegliere **Installa app** dal pulsante proposto o dal menu ⋮; su iPhone usare **Condividi → Aggiungi alla schermata Home**. Installazione e autorizzazione delle notifiche richiedono l'azione dell'utente.
- Il pulsante **Attiva avvisi locali** chiede il permesso del browser e può mostrare notifiche di anomalia **soltanto mentre il Control Center è aperto e può consultare GitHub**. Non invia Web Push, non continua i controlli con l'app chiusa e non tiene una connessione in background.
- Per gli avvisi **anche con Control Center chiuso**, è configurata separatamente un'automazione di monitoraggio separata di controllo orario. Le sue notifiche dipendono dalle impostazioni dell'account e dalle autorizzazioni di notifica del telefono; non vengono gestite né memorizzate da questa PWA.
- Nessun nuovo server, token, subscription push, segreto o costo GitHub viene introdotto. Gli errori temporanei o gli esiti non aggiornati non vengono dichiarati guasti confermati dell'app.
