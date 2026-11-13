# Fase 3 — Pubblicazione pubblica Porti con Cloudflare, senza runner GitHub Actions

## Stato e separazione responsabilità

- Il Worker autorevole `container-booking-backend` continua ad acquisire CNT, TFG e SCT ogni 15 minuti e conserva `schedule:*`, `status:*` e backup versionati `backup:v1:*` in KV.
- Questo **nuovo** Worker `lts-porti-public-snapshot-publisher` legge esclusivamente tali chiavi KV, applica filtri di pubblicazione pubblica e prepara **un solo commit Git fast-forward non forzato** sul ramo `main` di `pasqualemilano0-rgb/LTS-Registro-Viaggi`. Non legge né esporta booking, utenti, sessioni o token.
- La pagina LTS continua a usare il gateway TFG esistente. La pubblicazione dei file di fallback non equivale ad autorizzazione al ritiro dei container.
- **Stato iniziale storico:** il Worker è stato rilasciato prima del collaudo con `PUBLISH_ENABLED=no` e `crons=[]`. **Stato attuale verificato (12 novembre 2026):** `PUBLISH_ENABLED=yes`, cron `8,38 * * * *` attivo, secret GitHub a permessi limitati presente; vedi l'handoff operativo seguente.
- **Cutover completato (12/11/2026):** il vecchio workflow `.github/workflows/refresh-lts-porti-snapshots.yml` è stato rimosso da `main` con la PR #154 soltanto dopo un commit automatico riuscito, controlli di freschezza e test di ripristino dei backup. I vecchi passi sotto restano come cronologia del collaudo.

## Controlli prima di scrivere

1. Tutte e tre le sorgenti devono provenire dai link ufficiali fissi; `monitor_origin=cloudflare_official_read`.
2. `status.state=ok`, `last_error_code=null`, timestamp di acquisizione identico a `status.last_success_at`, età massima 45 minuti (scarto futuro ammesso 5 minuti).
3. Valida numero righe (1–2000), nomi dei campi ammessi per terminal, soli valori scalari non troppo lunghi, assenza di campi personali o booking.
4. Verifica che esista almeno un backup KV per ciascun terminal, e che il numero delle righe non diminuisca improvvisamente rispetto al fallback pubblico.
5. Non sostituisce mai timestamp di acquisizione più recenti; per TFG vieta anche il rollback della versione ufficiale.
6. Filtra esplicitamente `live`, `booking_verified`, `monitor_origin` e ogni campo non compreso nel formato JSON pubblico.
7. Se un solo controllo fallisce **non crea né aggiorna commit**. Se nulla è cambiato, evita il commit.
8. Le tre modifiche sono applicate mediante GitHub Git Data API (blobs → unico tree → unico commit → aggiornamento refs `force=false`). In caso di modifica concorrente del ramo `main`, il ref non viene sovrascritto a forza.

## Attivazione manuale, solo dopo il collaudo QA

**Non condividere mai token in chat o nei commit.**

1. In GitHub crea un **fine-grained personal access token**, repository access **Only select repositories** → `LTS-Registro-Viaggi`, permission **Contents: Read and write**. Non assegnare `Administration`, `Workflows`, accesso al repo LTS privato o permessi ad altri repository. Imposta scadenza breve, responsabilità di rotazione e un accesso di recupero.
2. Cloudflare Dashboard → Workers & Pages → Worker **`lts-porti-public-snapshot-publisher`** → Settings → Variables and Secrets → aggiungi **Secret** `GITHUB_PUBLIC_CONTENTS_TOKEN`. Non creare il secret sul Worker TFG o su quello QA pubblico.
3. Esegui un collaudo read-only su `/health` e verifica le tre origini, i 3 backup, la freschezza e i test CircleCI.
4. Sul Worker definitivo, **solo dopo l'esito positivo del test con token**, imposta `PUBLISH_ENABLED=yes` e un cron **`8,38 * * * *`** (UTC, 2 volte all'ora). Non modificare il cron del backend Booking.
5. Verifica un commit nuovo su `main`, tutti e tre i JSON aggiornati, `/api/monitor/status`, i backup KV e la protezione di JWT/MFA/TFG. Se la pubblicazione fallisce, lascia gli snapshot precedenti e ripristina `PUBLISH_ENABLED=no`.
6. Soltanto dopo almeno un ciclo completo positivo, preparare una PR distinta per eliminare il `schedule` e il `workflow_dispatch` automatico del vecchio publisher GitHub, conservando i suoi test offline su CircleCI.

**Limite noto:** con un token Contents:write è possibile effettuare scritture nel repository selezionato (GitHub non limita i permessi Contents a tre singoli percorsi). Il codice contiene un elenco fisso dei tre file e usa sempre `force=false`. Custodire e ruotare il token.

## Risultati verificati / ancora necessari

- QA Cloudflare read-only: `lts-porti-public-publisher-qa.pasqualemilano0.workers.dev/health`, senza token e senza cron.
- CircleCI: `cloudflare-publisher-contract` + `snapshot-publisher-contract` e regressioni Booking/Webapp.
- **Superati in produzione il 12 novembre 2026:** prova reale del token GitHub tramite pubblicazione monouso, commit atomico e verifica post-pubblicazione, ripristino isolato dei backup. **Ancora da verificare:** primo ciclo `scheduled()` reale, osservabilità dell'esito e attivazione/riuscita effettiva di CircleCI schedulato.

## Handoff operativo aggiornato — 12 novembre 2026 (ore 20:55 Europe/Rome)

### Stato effettivamente verificato, non ipotesi

- **Repository:** `pasqualemilano0-rgb/LTS-Registro-Viaggi`, `main`. Commit di pubblicazione controllata: [`be24e8d71b26d3881cb2eea7c55d93e3ba955573`](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/commit/be24e8d71b26d3881cb2eea7c55d93e3ba955573), 12/11/2026 19:43:20 UTC; contiene **solo** `porti/data/conateco.json`, `porti/data/tfg_schedule.json`, `porti/data/sct.json`. Nessun token o campo di booking riservato nei root JSON pubblicati.
- **Valori pubblicati:** CNT 41 righe, TFG 19 righe, SCT 28 righe; `acquired_at=2026-11-12T19:30:17.205Z` per tutte e tre le copie. Attenzione: `source_updated_at` TFG è `2026-11-12T13:08:54.000Z`: freschezza dell'acquisizione e aggiornamento dichiarato dalla fonte sono distinti.
- **Worker:** `lts-porti-public-snapshot-publisher`, versione **v8** `63539da9-aeab-49c6-838e-b98b886de042` al 100%, codice ripristinato identico al sorgente `cloudflare/public-snapshot-publisher/index.mjs` (11.702 caratteri, digest di confronto FNV32 `9c5c8166`). Handler di prova temporaneo assente; restano solo `fetch` e `scheduled`.
- **Impostazioni:** `PUBLISH_ENABLED=yes`; secret `GITHUB_PUBLIC_CONTENTS_TOKEN` presente (mai letto o esportato); binding `SCHEDULES_KV` al namespace `0f3ce70b4e934cb3b8d78083a2ef5f23`; cron `8,38 * * * *` UTC attivato alle `2026-11-12T19:46:17Z`.
- **Booking separato:** Worker `container-booking-backend` invariato, cron `*/15 * * * *`; nessuna modifica prevista a JWT, MFA, sessioni autisti, API Booking TFG, CORS o rate limiting.
- **Prova monouso:** versione QA v7 con handler interno Queue; un solo messaggio; `state=published`, `updated=[cnt,tfg,sct]` registrati in KV con SHA suddetto. La coda e il consumer sono stati cancellati; la versione temporanea non è più in servizio e non è presente un URL HTTP pubblico di pubblicazione.
- **Backup e recupero:** almeno un `backup:v1:*` per terminal, verificati leggibili; ripristino in un namespace KV temporaneo isolato e confronto dei tre JSON riusciti (41/19/28 righe). Namespace temporaneo eliminato; KV di produzione non sovrascritto. Tale prova verifica il recupero dei dati, non un restore dell'intera applicazione.
- **CI su commit `be24e8d`:** CircleCI `snapshot-publisher-contract`, `cloudflare-publisher-contract`, `booking-auth-transport`, `webapp-regression` tutti `success`. La pianificazione *ricorrente* di CircleCI non è stata dimostrata da questi quattro job.
- **GitHub Actions al momento di quel checkpoint (20:55 italiane):** il workflow precedente era ancora presente. La situazione successiva al merge #154 è registrata in **Fase 4** più sotto. Il budget effettivo di fatturazione rimane non verificato.

### Passo successivo, con blocco di sicurezza

1. **Primo ciclo automatico:** la prima scadenza del cron dopo l'attivazione è il **12/11/2026 alle 20:08 UTC (21:08 italiane)**. La verifica programmata alle **21:20 italiane** deve accertare l'invocazione effettiva e il suo esito. Un trigger configurato, da solo, non dimostra un ciclo riuscito. Cercare evento `PUBLIC_PORTI_PUBLISH` o `PUBLIC_PORTI_PUBLISH_ERROR` nei log se disponibili; non presumere successo dall'assenza di errori.
2. Verificare `status:cnt/tfg/sct`, `schedule:cnt/tfg/sct`, backup, età massima 45 minuti, identità dei timestamp, eventuale nuovo commit non forzato e i tre JSON in `main`. Se i dati sono invariati e il Worker risponde `unchanged`, richiedere prova diretta del job riuscito; non inventare un commit. Monitorare `/api/monitor/status` quando accessibile.
3. **Solo dopo ciclo automatico accertato:** preparare una **PR distinta** per rimuovere `schedule` e `workflow_dispatch` da `.github/workflows/refresh-lts-porti-snapshots.yml` e non lasciare job di pubblicazione GitHub Actions raggiungibili. Conservare i controlli offline equivalenti in CircleCI; eseguire regressioni e verificare costi. **Non unire** quella PR prima dei gate, e non spegnere gli altri workflow GitHub Actions senza specifica sostituzione collaudata.
4. Migrare separatamente disponibilità/monitoraggio, controlli di sicurezza live e promemoria iPhone (attualmente basati su identità OIDC GitHub Actions), senza indebolire autenticazione. Usare Cloudflare/CircleCI solo dopo parità verificata. Confermare a parte il saldo effettivo GitHub Actions.
5. Se il Worker fallisce: non ripetere a forza la pubblicazione; preservare le copie precedenti, ricontrollare token/freschezza/backup e, ove serva bloccare nuove scritture, ripristinare `PUBLISH_ENABLED=no` mediante procedura sicura. Non cambiare il Worker Booking.

**Politica di rilascio:** questo handoff documenta risultati già osservati e attività future distinte. Non equivale a un'autorizzazione a cancellare subito GitHub Actions né a una certificazione 10/10 di tutta LTS.

## Fase 4 — Cutover del publisher completato, 12 novembre 2026 (21:24 Europe/Rome)

### Risultati positivi della prima esecuzione programmata

- Cron Cloudflare in produzione: `8,38 * * * *` UTC sul Worker `lts-porti-public-snapshot-publisher` v8 `63539da9-aeab-49c6-838e-b98b886de042`, `PUBLISH_ENABLED=yes`.
- Alle **20:08:44 UTC (21:08:44 italiane)** il Worker ha prodotto su `main` il commit [`84b0ebf429b9747256273a774efed0f9e7ff8d93`](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/commit/84b0ebf429b9747256273a774efed0f9e7ff8d93): aggiornamento verificato di CNT, TFG e SCT **senza GitHub Actions**. Timestamp e contenuti dei tre JSON coerenti con lo snapshot KV valido delle 20:00 UTC. Non sono stati letti log di invocazione diretti; il commit a distanza di 44 secondi dal cron e il messaggio del pubblicatore costituiscono la prova osservata.
- Stato acquisitori alle 20:15:16 UTC: CNT 41 righe, TFG 19 righe, SCT 28 righe; `state=ok`, `last_error_code=null` per ciascuno. Cron del Worker `container-booking-backend` invariato: `*/15 * * * *`.
- Backup `backup:v1:*` per i tre terminal già ripristinati con successo in un namespace KV temporaneo isolato, poi eliminato. JWT, MFA e Booking TFG non modificati; questa è prova di non modifica della configurazione, non un nuovo test di login end-to-end.

### Ritiro del publisher GitHub Actions

- **PR [#154](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/154) unita su `main`**; SHA di merge `5fef36475111e26dedbedcca4b73ffcba799a891`.
- La PR ha **eliminato** `.github/workflows/refresh-lts-porti-snapshots.yml` e aggiornato `tests/qa-no-auto-publish.test.mjs` per verificare che non esista più il vecchio publisher e che la pubblicazione Cloudflare resti fail-closed e atomica.
- **Quattro controlli CircleCI** sul candidato PR #154 conclusi `success`: `snapshot-publisher-contract`, `cloudflare-publisher-contract`, `booking-auth-transport`, `webapp-regression`; anche sei check-run GitHub Actions relativi al candidato hanno avuto esito positivo. Non assumere che ciò certifichi costo 0 o assenza di esecuzioni Actions degli altri workflow.
- Controllo dopo merge: la directory `.github/workflows` di `main` contiene **8 file**, senza `refresh-lts-porti-snapshots.yml`. Il Worker Cloudflare rimane attivo e il cron Booking rimane invariato. Un check CircleCI sul commit di merge era ancora `pending` nell'ultima lettura; ricontrollarlo prima di dichiarare verde l'intero commit.

### Cosa manca prima dell'obiettivo generale GitHub Actions = 0 $ / zero runner LTS

1. **Non disattivare ciecamente gli altri workflow.** Sono rimasti 8 workflow nel repository pubblico e, alla precedente ricognizione, 27 nel privato `LTS`. Alcuni sono attivati da `push`, `pull_request`, `schedule` o `workflow_dispatch` e possono generare minuti Actions.
2. **Promemoria iPhone pubblico:** attualmente usa `iphone-reminders.yml` con cron ogni cinque minuti e token di identità OIDC specifico GitHub Actions. Per sostituirlo con Cloudflare serve una nuova autenticazione server-to-server, adeguati permessi, rate limiting e test di consegna; non cancellare i promemoria né aggirare l'identità OIDC esistente.
3. **Monitor disponibilità:** esiste già `lts-registro-uptime-independent` su Cloudflare; confrontare copertura e allarmi rispetto a `lts-uptime-monitor.yml` e dismettere il runner soltanto con parità verificata.
4. **Verifiche private Booking/Security:** migrare le pianificazioni residue verso CircleCI schedulato o Cloudflare read-only, distinguendo test offline da controlli autenticati/live. Conservare JWT, MFA, CORS, rate limiting e cron Booking.
5. **Economia/CI:** confermare il billing reale di Actions; verificare che CircleCI sia verde e non esegua test doppi. Non dichiarare "0 $" solo dalla presenza della configurazione CircleCI.

### Rollback e guardrail

Se gli snapshot pubblici smettono di aggiornarsi, confrontare `status:*`, `schedule:*`, backup, ultimo commit e cron. Non riattivare il vecchio workflow senza valutazione e autorizzazione; non generare cron concorrenti. Bloccare eventuali scritture Cloudflare con `PUBLISH_ENABLED=no` solo quando necessario e con procedura controllata. Non modificare il Worker Booking o il suo cron.

## Monitor disponibilità LTS — passaggio Cloudflare (12 novembre 2026)

- Il Worker indipendente `lts-registro-uptime-independent` è stato aggiornato con la PR [#156](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/156), merge `af3ced26a843fad5fba4e8daddcdc25c58e0f44a`, versione Cloudflare `ba76d148-8aeb-482a-8fb8-3ebee8ee7753`.
- Primo ciclo reale riuscito alle **21:47 (Europe/Rome)** del 12 novembre 2026, verificato nei log Cloudflare Workers Observability: `LTS_MONITOR_OK {"checked":["site","admin","bundle","auth"]}`, evento scheduled con `outcome=ok`, versione v2 confermata. Controlla la disponibilità tecnica HTTP e il preflight CORS, **non** garantisce tutte le funzionalità della webapp.
- Cron Cloudflare conservato: `2,17,32,47 * * * *` (ogni 15 minuti). Il vecchio cron GitHub Actions `23 * * * *` è stato ritirato con la PR [#157](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/157), merge `ea841bfb9b9b8995e92c50973b43210b8a3765b5`, dopo esito positivo dei quattro job CircleCI e `full-qa`. È stato eliminato **solo** `.github/workflows/lts-uptime-monitor.yml`.
- Restano in repository `scripts/lts_health_monitor.py` (read-only), `cloudflare/uptime-monitor/index.mjs` e `tests/qa-lts-cloudflare-uptime.test.mjs`, eseguiti dalla pipeline CircleCI. Il Worker non contiene credenziali e il suo endpoint HTTP risponde 404.
- Il Worker Booking TFG `container-booking-backend` e il cron `*/15 * * * *` non sono stati modificati. Non modificati neppure JWT, MFA, GitHub Pages, pubblicazione Porti e regole CORS Supabase.
- Per i controlli successivi: Cloudflare Workers Observability, filtro `$metadata.service=lts-registro-uptime-independent`, cerca `LTS_MONITOR_OK` oppure `LTS_MONITOR_FAIL`; in caso di FAIL verificare i singoli endpoint prima di considerare sano il servizio.

## Fase 5 — Riduzione runner LTS con parità CI verificata (12 novembre 2026)

### Repository pubblico `LTS-Registro-Viaggi`

- **PR [#159](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/159)** → commit `f6c3557d0599e4915ef2e6e24883a8aefd29c227`: rimossi `qa-porti-maintenance.yml` e `qa-tfg-booking-offline.yml` dopo verifica dei test equivalenti su CircleCI; aggiunto test che impedisce la perdita del presidio.
- **PR [#160](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/160)** → commit `640dfdad924dc0adf7af16b43ddf043806bf7b55`: replica completa del vecchio `full-qa` su job CircleCI esistenti: `find ... '*.mjs' ... node --check`, `node --check sw.js`, `node --test tests/*.test.mjs`, `python -m unittest discover -s tests -p 'test_*.py' -v`. I test di parità sono stati aggiornati per riconoscere la suite completa senza perdere i singoli controlli. 4/4 CircleCI e 6/6 check GitHub sul candidato superati, e 4/4 CircleCI sul commit di merge.
- **PR [#161](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/161)** → commit `15ae0c441181720cdfaaf0c0a6ce262bc1fd9dc4`: rimosso `qa-full-prerelease.yml` dopo verifica di piena parità della suite JS/Python in CircleCI. Nessuna regola di protezione segnalata come bloccante da GitHub al merge; non equivale a ispezione amministrativa completa delle ruleset.
- **PR [#162](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/162)** → commit `140eb807c75c0d2091b1de9de2deafa8ff5a812e`: aggiunto `node tests/maps-redirect-diagnostic.mjs` a CircleCI. La suite `tests/*.test.mjs` già comprende `qa-admin-records-live.test.mjs` e `qa-maps-reader-live.test.mjs` (test CORS e diniego anonimo senza credenziali); 4/4 job CircleCI verdi in PR e sul primo commit `main`.
- **PR [#163](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/163)** → commit `d8fbb35ed54de4cacf9a7d477f16d87517ca434b`: eliminato `qa-account-release.yml`, con test di assenza e copertura CircleCI. 4/4 CircleCI verdi prima e dopo il merge.
- **Stato attuale accertato:** `.github/workflows/` contiene **solo tre file**: `iphone-reminders.yml`, `porti-auth-transport-diagnostic.yml`, `qa-company-report-release.yml`. La semplice presenza di un workflow non prova un costo, ma questi file possono ancora avviare runner GitHub Actions.

### Repository privato `LTS`

- **PR [#136](https://github.com/pasqualemilano0-rgb/LTS/pull/136)** → commit `542922919d3921085f40b592240bd981d7ea0fc8`: il workflow legacy `apple-ipa.yml` non parte più su `push`; resta **solo manuale** (`workflow_dispatch`). Nessun runner macOS automatico per il progetto IPA non più richiesto. 4/4 CircleCI verdi sul candidato e sul commit dopo merge.
- Il repository privato presenta ancora **27 file workflow**: diversi sono solo manuali, alcuni su PR/push, e vi sono pianificazioni (fra cui Booking live, sicurezza periodica e shadow Porti condizionato). Non disattivare indiscriminatamente il monitoraggio di sicurezza o le verifiche Booking. L'archivio `iphone-reminders.yml` privato è manual-only e contiene una guardia che non autorizza l'esecuzione operativa nel repo privato.

### Residui da affrontare, senza regressioni o spese aggiuntive

1. **Promemoria iPhone pubblico**: cron `2-57/5 * * * *` (potenziali 288 avvii/giorno, esecuzione GitHub best-effort); utilizza JWT OIDC emesso esclusivamente da GitHub Actions e validato lato backend. Per migrare a Cloudflare serve autenticazione macchina-macchina dedicata, autorizzazioni lato backend, rate limit e prova reale di consegna, **senza togliere OIDC prima del cutover**.
2. **QA report aziendale**: `qa-company-report-release.yml` conserva test browser Chromium + WebKit con Playwright, sintassi/QA e live smoke `qa-report-production-http-smoke.mjs`. La suite JS e il controllo account sono su CircleCI, ma la **parità browser e dello smoke standalone non è ancora dimostrata**. Prima della rimozione, eseguire equivalenti CI su immagini/browser fissati e controllarne i costi in crediti.
3. **Diagnostica Porti transport**: `porti-auth-transport-diagnostic.yml` può ancora eseguirsi manualmente o su push del ramo diagnostico specifico. Include smoke HTTP read-only di Pages, preflight Supabase e rifiuto sessione anonima. Non rimuovere finché un percorso alternativo testato non copre queste verifiche.
4. **Private LTS**: valutare cron Booking live e sicurezza solo dopo parità verificata nei job CircleCI schedulati/Cloudflare; evitare Cloudflare Error 1010, non indebolire JWT, MFA, CORS o rate limiting e mantenere il cron `container-booking-backend` `*/15 * * * *`.
5. **Budget**: CircleCI Free offre crediti inclusi, ma il saldo reale, l'eventuale qualificazione Open Source del pubblico e il billing GitHub Actions **non sono stati letti**. Non dichiarare ancora budget Actions `0 $` né costo totale `0 $` senza i dati di fatturazione e l'assenza di runner attivi. Non aggiungere metodi di pagamento.

**Regola di rilascio per le prossime fasi:** prima la parità di ogni controllo (anche browser/live), poi test verdi su PR e su `main`, infine ritiro del solo workflow ridondante in PR distinta. I servizi Cloudflare (Porti, uptime, Booking) devono restare invariati e protetti.

## Fase 6 — Pilota Chromium/WebKit CircleCI riuscito (13 novembre 2026)

- **PR [#165](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/165)**, merge `475eda5df36294653e99f21b41613d6c7cd426a8`, modifica **solo** `.circleci/config.yml` e `tests/qa-circleci-report-browser-parity.test.mjs`. Il job `ci/circleci: browser-report-parity` è realmente `success` sul commit candidato `dd994715df42b201bb2a5b89513004ef9d7a2cfa`, insieme agli altri quattro job CircleCI. I quattro job ordinari sono `success` anche sul commit di merge.
- **Ambiente:** un singolo job Docker `resource_class: medium`, immagine Playwright `v1.56.1-noble` con lo **stesso digest** già usato dal vecchio workflow GitHub. Chromium e WebKit girano in sequenza; vengono eseguiti dashboard e report sintetici, Registro mobile, PWA offline, IndexedDB, verifiche di isolamento account e preflight CORS/JWT sul report senza credenziali. Gli artifact Control Center sintetici vengono conservati tramite CircleCI `store_artifacts`.
- **Protezione consumi:** il workflow `browser-release-parity` è limitato a rami `ci/browser-parity-*` e `release/*`. Il ramo `main` non avvia il job browser quando Cloudflare pubblica automaticamente CNT/TFG/SCT ogni 30 minuti. Quindi un pilot verde **non equivale ancora** a copertura browser su tutte le PR applicative.
- **Sicurezza:** nessuna modifica a Supabase, JWT, MFA, Booking TFG, Worker Cloudflare, crons o token; nessuna lettura di dati personali nei test browser, che impiegano fixture sintetiche. Il test HTTP di produzione verifica solo CORS e diniego dell'accesso anonimo e con JWT falsi.
- **Stato della migrazione:** `.github/workflows/qa-company-report-release.yml` resta **attivo**, così come `iphone-reminders.yml` (OIDC) e `porti-auth-transport-diagnostic.yml`. Il repository pubblico conserva **tre** workflow GitHub Actions. Il saldo CircleCI effettivo e il budget GitHub Actions non sono stati verificati: non dichiarare `0 €` o `0 $`.

### Gate successivo prima di ritirare il workflow browser GitHub

1. Determinare il costo reale del job `browser-report-parity` in CircleCI, i crediti Free residui e il numero previsto di esecuzioni mensili; non aggiungere carte/metodi di pagamento e non aumentare i trigger alla cieca.
2. Implementare un **filtro sulle modifiche delle PR** o altra forma di selezione di costo equivalente, che attivi Chromium/WebKit quando cambiano dashboard, registro, PWA, account, report o relativi test, evitando i commit `data(porti)`, documentazione e altri aggiornamenti automatici. Una semplice allowlist di nomi di ramo non copre tutte le PR: testarla su una PR applicativa normale prima del cutover.
3. Confrontare anche lo smoke live `qa-report-production-http-smoke.mjs`, la protezione dell'autenticazione e gli artifact sintetici. Verificare almeno un altro giro di test (oltre al pilot) e che le protezioni dei rami non richiedano un contesto GitHub Actions non più prodotto.
4. Solo dopo la parità verificata e sostenibile sul piano economico, preparare **PR distinta** per ritirare `qa-company-report-release.yml`. Non eliminare prematuramente il workflow. Il lavoro su OIDC promemoria iPhone resta separato.

## Fase 6.1 — Validazione filtro economico browser (13 novembre 2026)

- **PR [#167](https://github.com/pasqualemilano0-rgb/LTS-Registro-Viaggi/pull/167)** unita a `main`, commit `6264878646ea75beb7f335c7e4fdf3b6aea63348`, dopo **5/5 CircleCI verdi**, incluso il job Chromium + WebKit. Sul merge `main` i quattro controlli ordinari CircleCI sono tutti `success`.
- Il nuovo `scripts/ci-browser-change-gate.mjs` compara il ramo con `origin/main` e considera non pertinenti solo la documentazione e i tre JSON di snapshot Porti già noti; tutte le modifiche applicative, di test, CI o sconosciute restano pertinenti. In caso di diff non disponibile esegue comunque i browser (fail-open).
- Il job browser è disponibile su ogni ramo diverso da `main`; il filtro esce prima di installare Playwright su modifiche soltanto documentali o snapshot. Questo stesso aggiornamento dell'handoff serve da **prova controllata docs-only** del comportamento di skip: verificare lo stato del job CircleCI e, idealmente, il messaggio `BROWSER_SKIP` nei relativi log prima di considerarlo un vero risparmio misurato.
- **Non è ancora completato il cutover GitHub Actions:** `qa-company-report-release.yml` resta in vigore finché non saranno accertate le prove sui rami PR, la copertura dei push diretti a `main` o il blocco dei push diretti, i contesti di controllo richiesti e il consumo reale CircleCI. `iphone-reminders.yml` e `porti-auth-transport-diagnostic.yml` non cambiano.
- Al prossimo passaggio verificare su una PR con solo `docs/**` che i cinque status CircleCI siano coerenti, che il job medium si arresti prima dei browser e che gli artifact sensibili non siano presenti. Nessun nuovo metodo di pagamento.
