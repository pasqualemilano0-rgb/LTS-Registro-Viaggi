<p align="center">
  <img src="assets/lts-logo.png" alt="LTS Registro Viaggi" width="180">
</p>

# LTS Registro Viaggi

**Gestione dei viaggi, organizzazione del lavoro e consultazione dei terminal portuali.**

Una sola applicazione per gli autisti e per la gestione operativa del trasporto container.

[**Apri l'applicazione**](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/) · [**Pannello amministratore**](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/amministratore/) · [**Informativa privacy**](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/privacy/)

---

## Il progetto

**LTS Registro Viaggi** è una web app installabile su smartphone, pensata per registrare l'attività giornaliera degli autisti, gestire clienti e tariffe, consultare i programmi delle navi e produrre il riepilogo mensile.

L'interfaccia riunisce in un unico ambiente cinque sezioni: **Inserisci viaggio, Registro viaggi, Clienti, Tariffe e Porti**. L'accesso ai registri personali richiede un account autorizzato.

## Funzionalità

| Area | Cosa permette di fare |
| --- | --- |
| **Viaggi** | Registrazione e modifica dei trasporti, container, seconde prese, note e servizi extra |
| **Registro** | Consultazione mensile dei viaggi, riepiloghi e generazione del resoconto PDF |
| **Clienti** | Rubrica dedicata e gestione delle informazioni operative |
| **Tariffe** | Tariffario per cliente e destinazione, calcolo delle trasferte e degli extra |
| **Porti** | Ricerca booking e consultazione delle navi presso CO.NA.TE.CO., TFG e SCT |
| **Backup e sincronizzazione** | Recupero dei dati precedenti, importazione controllata e sincronizzazione dell'archivio personale |
| **Control Center aziendale** | Sette sezioni riservate all'amministratore: panoramica, account, viaggi, analisi, anomalie, report e sicurezza |

I resoconti PDF riportano i dati operativi previsti dal registro; **gli importi economici non vengono inseriti nel PDF mensile**.

### Porti e booking

La sezione **Porti** è parte integrante di LTS, non un'applicazione da installare separatamente.

- **Napoli — CO.NA.TE.CO.:** ricerca booking, programma navi e indicazioni operative su depositi e aree di consegna.
- **Napoli — Terminal Flavio Gioia:** consultazione navi, ricerca booking e informazioni disponibili sull'accettazione.
- **Salerno — SCT:** elenco navi, accettazione Dry/Reefer, ETA e orari di chiusura quando pubblicati dalla fonte.

Le informazioni provengono da fonti e servizi esterni e possono subire ritardi o indisponibilità. **Il programma navi non equivale alla conferma di un booking né autorizza l'ingresso al terminal.** Prima della consegna occorre verificare le condizioni ufficiali.

## Accesso e gestione degli autisti

L'accesso al registro avviene mediante **numero di telefono e password personale**. L'attivazione dei nuovi account è gestita dall'amministratore tramite invito; non è prevista la registrazione pubblica libera.

Il pannello amministrativo consente la gestione degli inviti, la disattivazione e riattivazione degli accessi, la rimozione reversibile di un autista e il recupero delle credenziali. La rimozione reversibile conserva l'account e lo storico dei viaggi.

Nella versione web, la sessione dell'autista può essere ricordata sul dispositivo; l'autorizzazione viene verificata nuovamente dal servizio online. La password non viene salvata nel registro.

## LTS Control Center — pannello aziendale

Il [pannello amministratore](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/amministratore/) comprende **sette sezioni operative** con navigazione laterale su computer e menu scorrevole su smartphone.

| Sezione | Attività |
| --- | --- |
| **Panoramica** | Riepilogo dei viaggi sincronizzati, indicatori e andamento del mese |
| **Gestione autisti** | Inviti, attivazioni, blocchi, recuperi e reinserimenti reversibili |
| **Registro viaggi** | Consultazione dettagliata dei viaggi, filtro per autista e periodo |
| **Analisi e grafici** | Storico di 12 mesi, attività individuale, confronti, clienti e località |
| **Anomalie** | Tariffe mancanti, possibili duplicati e sincronizzazioni da controllare |
| **Report PDF ed Excel** | Esportazione dei dati aziendali o individuali filtrati |
| **Sicurezza e accessi** | Verifica sessione amministratore e gestione della protezione MFA |

La sezione aziendale è **in sola lettura** rispetto ai viaggi e richiede autenticazione amministratore con MFA. Gli importi rappresentano valori di trasferte registrate, **non utili aziendali né stipendi**. I PDF/Excel amministrativi sono separati dal PDF mensile personale dell'autista, nel quale gli importi economici non vengono riportati.

**Stato della release:** la console a sette sezioni è stata pubblicata il **4 novembre 2026** e ha superato i controlli automatici su sicurezza, browser mobile/desktop, pagine e download dei report. È ancora da registrare la prova visiva manuale su smartphone con un amministratore reale.

## Utilizzo su smartphone

**iPhone / iPad:** aprire [LTS Registro Viaggi](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/) in Safari e selezionare **Condividi → Aggiungi alla schermata Home**.

**Android:** la web app è accessibile dal browser. È disponibile anche un progetto APK dedicato, la cui compatibilità con il nuovo sistema di account richiede ancora completamento e collaudo: la versione nativa precedente non deve essere considerata equivalente alla PWA aggiornata.

Per utilizzare le funzioni personali è necessaria una prima verifica online dell'account. La disponibilità dei dati offline dipende da una sessione già verificata e dalle condizioni del dispositivo; informazioni portuali non aggiornate non vengono presentate come conferme in tempo reale.

## Continuità dei dati e sicurezza

- Archivi personali distinti per account, con controlli di autorizzazione lato server.
- Recupero degli archivi precedenti dopo login, con backup preventivo e conferma dell'utente.
- Importazione JSON/ZIP che evita sovrascritture automatiche in presenza di conflitti.
- Revoca delle sessioni e blocco dell'accesso agli account disattivati.
- Dati dei viaggi separati dalle consultazioni dei programmi navali.

La sicurezza di una web app installabile dipende anche dalla protezione del dispositivo e dei backup esportati. L'applicazione è soggetta a verifiche e miglioramenti continui.

## Pubblicazione

Questo repository contiene **esclusivamente la distribuzione web pubblica** di LTS Registro Viaggi: interfaccia, risorse statiche e controlli di qualità collegati al sito. La versione corrente del Control Center deriva dalla PR #33 (`7d8b68c68042e249aa95d8f8f2d4063553bf0ede`); il relativo deployment Pages e i test post-pubblicazione sono terminati correttamente.

Il progetto applicativo completo, i componenti server, i pacchetti Android e la documentazione operativa sono mantenuti separatamente in un archivio di sviluppo riservato. **Non pubblicare in questo repository** registri personali, password, token, chiavi di firma o esportazioni dei database.

Il sito è distribuito tramite GitHub Pages:

**https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/**

---

<sub>LTS Registro Viaggi · Applicazione gestionale per l'attività di trasporto · Le indicazioni dei terminali sono informative e non sostituiscono le comunicazioni ufficiali.</sub>
