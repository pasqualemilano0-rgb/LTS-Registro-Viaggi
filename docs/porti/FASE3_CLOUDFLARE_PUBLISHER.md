# Fase 3 — Pubblicazione pubblica Porti con Cloudflare, senza runner GitHub Actions

## Stato e separazione responsabilità

- Il Worker autorevole `container-booking-backend` continua ad acquisire CNT, TFG e SCT ogni 15 minuti e conserva `schedule:*`, `status:*` e backup versionati `backup:v1:*` in KV.
- Questo **nuovo** Worker `lts-porti-public-snapshot-publisher` legge esclusivamente tali chiavi KV, applica filtri di pubblicazione pubblica e prepara **un solo commit Git fast-forward non forzato** sul ramo `main` di `pasqualemilano0-rgb/LTS-Registro-Viaggi`. Non legge né esporta booking, utenti, sessioni o token.
- La pagina LTS continua a usare il gateway TFG esistente. La pubblicazione dei file di fallback non equivale ad autorizzazione al ritiro dei container.
- **Stato iniziale storico:** il Worker è stato rilasciato prima del collaudo con `PUBLISH_ENABLED=no` e `crons=[]`. **Stato attuale verificato (12 novembre 2026):** `PUBLISH_ENABLED=yes`, cron `8,38 * * * *` attivo, secret GitHub a permessi limitati presente; vedi l'handoff operativo seguente.
- Il vecchio `.github/workflows/refresh-lts-porti-snapshots.yml` **non va disattivato** prima di un commit automatico riuscito del nuovo Worker, una verifica della freschezza e un collaudo del ripristino.

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
- **GitHub Actions:** vecchio workflow `.github/workflows/refresh-lts-porti-snapshots.yml` **ancora attivo in configurazione**; altri workflow Actions esistono. Budget fatturazione a 0 $ **non certificato** dalle verifiche tecniche. Nessun workflow è stato disattivato in questo collaudo.

### Passo successivo, con blocco di sicurezza

1. **Primo ciclo automatico:** la prima scadenza del cron dopo l'attivazione è il **12/11/2026 alle 20:08 UTC (21:08 italiane)**. La verifica programmata alle **21:20 italiane** deve accertare l'invocazione effettiva e il suo esito. Un trigger configurato, da solo, non dimostra un ciclo riuscito. Cercare evento `PUBLIC_PORTI_PUBLISH` o `PUBLIC_PORTI_PUBLISH_ERROR` nei log se disponibili; non presumere successo dall'assenza di errori.
2. Verificare `status:cnt/tfg/sct`, `schedule:cnt/tfg/sct`, backup, età massima 45 minuti, identità dei timestamp, eventuale nuovo commit non forzato e i tre JSON in `main`. Se i dati sono invariati e il Worker risponde `unchanged`, richiedere prova diretta del job riuscito; non inventare un commit. Monitorare `/api/monitor/status` quando accessibile.
3. **Solo dopo ciclo automatico accertato:** preparare una **PR distinta** per rimuovere `schedule` e `workflow_dispatch` da `.github/workflows/refresh-lts-porti-snapshots.yml` e non lasciare job di pubblicazione GitHub Actions raggiungibili. Conservare i controlli offline equivalenti in CircleCI; eseguire regressioni e verificare costi. **Non unire** quella PR prima dei gate, e non spegnere gli altri workflow GitHub Actions senza specifica sostituzione collaudata.
4. Migrare separatamente disponibilità/monitoraggio, controlli di sicurezza live e promemoria iPhone (attualmente basati su identità OIDC GitHub Actions), senza indebolire autenticazione. Usare Cloudflare/CircleCI solo dopo parità verificata. Confermare a parte il saldo effettivo GitHub Actions.
5. Se il Worker fallisce: non ripetere a forza la pubblicazione; preservare le copie precedenti, ricontrollare token/freschezza/backup e, ove serva bloccare nuove scritture, ripristinare `PUBLISH_ENABLED=no` mediante procedura sicura. Non cambiare il Worker Booking.

**Politica di rilascio:** questo handoff documenta risultati già osservati e attività future distinte. Non equivale a un'autorizzazione a cancellare subito GitHub Actions né a una certificazione 10/10 di tutta LTS.
