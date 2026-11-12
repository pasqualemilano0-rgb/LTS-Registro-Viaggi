# Fase 3 — Pubblicazione pubblica Porti con Cloudflare, senza runner GitHub Actions

## Stato e separazione responsabilità

- Il Worker autorevole `container-booking-backend` continua ad acquisire CNT, TFG e SCT ogni 15 minuti e conserva `schedule:*`, `status:*` e backup versionati `backup:v1:*` in KV.
- Questo **nuovo** Worker `lts-porti-public-snapshot-publisher` legge esclusivamente tali chiavi KV, applica filtri di pubblicazione pubblica e prepara **un solo commit Git fast-forward non forzato** sul ramo `main` di `pasqualemilano0-rgb/LTS-Registro-Viaggi`. Non legge né esporta booking, utenti, sessioni o token.
- La pagina LTS continua a usare il gateway TFG esistente. La pubblicazione dei file di fallback non equivale ad autorizzazione al ritiro dei container.
- Il Worker è inizialmente **disabilitato per le scritture** (`PUBLISH_ENABLED=no`, `crons=[]`, nessun token).
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
- Restano da provare su produzione: permesso GitHub Contents:write, commit atomico reale, verifica post-pubblicazione e trigger CircleCI schedulato; nessuna di queste condizioni è garantita dalla sola approvazione della PR.
