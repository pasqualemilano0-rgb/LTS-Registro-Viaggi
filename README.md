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

## Monitor LTS — solo amministratore

Il pannello tecnico **LTS Stato** è accessibile esclusivamente dal pannello
`/amministratore/`, nella sezione **Sicurezza e accessi**, dopo la verifica online
dell'account amministratore e dell'autenticazione MFA. Gli autisti non ricevono
un collegamento operativo al monitor, e la vecchia pagina `/status/` rimanda
all'accesso amministratore senza mostrare diagnostica.

Il monitor periodico pubblico [GitHub Actions](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/actions/workflows/lts-uptime-monitor.yml)
continua a controllare in sola lettura sito, pagina di accesso admin,
JavaScript e preflight del login. Non consulta credenziali, clienti o viaggi.
I risultati di un repository GitHub pubblico restano per natura visibili
su GitHub: per rendere riservati anche i log del monitor servirebbe spostare
le verifiche in un'infrastruttura con controllo degli accessi lato server.

L'area amministratore è già installabile come PWA separata. La vecchia PWA
pubblica `LTS Stato` è stata ritirata: chi l'aveva installata deve rimuovere
il vecchio collegamento; per l'accesso riservato usare l'app amministratore.
Gli avvisi continuano tramite il monitor esterno configurato; la pagina
amministrativa non installa un servizio push pubblico e non invia notifiche
autonome con la finestra chiusa.
