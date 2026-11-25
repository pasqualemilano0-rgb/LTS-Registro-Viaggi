# LTS — Politiche interne di privacy e sicurezza (bozza 2.0)
Data: 24 novembre 2026. Stato: proposta, non approvata. Non descrive controlli come attivi senza evidenza. Nessun dato personale, credenziale o dettaglio operativo riservato deve essere aggiunto a questo repository pubblico.

## Accessi e minimizzazione
- Separare registro autista e amministrazione anche lato API; verificare JWT, sessione, ruolo, destinatario e MFA amministrativa. Negare di default. Verificare RLS, bucket privati e assenza di chiavi privilegiate nel client.
- Concedere accesso ai documenti al solo destinatario e agli incaricati autorizzati; limitare upload e pubblicazione ai destinatari abilitati. Non estendere il rollout pilota con questa revisione.
- Revocare account e sessioni al cambio di ruolo o cessazione; riesaminare periodicamente privilegi. Non usare credenziali reali in CI, QA o log. La biometria locale non sostituisce autorizzazione server.
- Controllare CSP, CORS, rate limiting, isolamento account, link temporanei, download, cache e assenza di dati nei log. Verificare che i documenti non siano memorizzati dal service worker.
- Non utilizzare statistiche per controllo occulto dei lavoratori; valutare art. 4 L. 300/1970 e DPIA ex art. 35 GDPR ove necessaria.

## Conservazione e backup
Approvare una matrice distinta per registro, documenti retributivi/fiscali, presa visione, profili, sessioni, log, iscrizioni push, esportazioni e backup. Per ciascuna categoria indicare finalità, base giuridica, periodo o criterio, responsabile, cancellazione e obblighi di conservazione. Non impostare scadenze arbitrarie.
Proteggere e limitare accesso alle copie; verificare cifratura e ripristino con dati sintetici. Documentare rotazione, cancellazione e reintegro di eventuali cancellazioni dopo il ripristino. Non conservare ricerche booking personali nelle copie dei programmi navi.

## Incidenti e richieste
Segnalare immediatamente al titolare, contenere l'incidente, revocare accessi compromessi, conservare evidenze minimizzate e registrare valutazione, decisioni e azioni. Il titolare valuta notifica al Garante entro 72 ore dalla conoscenza della violazione, salvo improbabilità del rischio, e comunicazione agli interessati in caso di rischio elevato secondo artt. 33–34 GDPR. Documentare anche gli incidenti non notificati.
Gestire le richieste tramite un canale verificato; non richiedere password, token o archivi via email. Registrare le scadenze, verificare identità in modo proporzionato e motivare eventuali limitazioni.

## Gate prima della pubblicazione
1. Titolare: denominazione, indirizzo, contatti, DPO se nominato; basi giuridiche, obbligatorietà e destinatari.
2. Verificare contratti dei fornitori, regioni, subfornitori, trasferimenti, periodi e inventario effettivo cookie/storage.
3. Verificare separazione ruoli, documenti, conferma persistente, log e cache con dati sintetici; mantenere test esistenti e CircleCI, senza creare ambienti aggiuntivi.
4. Approvazione aziendale e consulente privacy; eventuale informativa lavoratori e adempimenti art. 4. Rimuovere indicazione di bozza solo dopo approvazione e integrazione dei dati.
5. Allineare copie archiviate nel repository privato tramite revisione separata, senza sovrascrivere sorgenti divergenti.
6. Nessuna modifica produttiva a RLS, autenticazione o retention in questa PR. Eventuali correzioni tecniche richiedono evidenza, migrazione revisionata, test e rollback.

Riferimenti: GDPR https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=it ; Garante https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876 .
