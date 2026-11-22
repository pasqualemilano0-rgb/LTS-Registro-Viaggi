# I MIEI DOCUMENTI — QA 22 novembre 2026

PR principale: pubblica #193; precedente candidato `8ec6653ed0d521aa9e3150fe7f2f2931043b9b41`.
PR #194: ripresa selettivamente la revoca amministrativa con transizione e audit atomici, adattata allo schema `driver_id/state` della #193. Nessun merge dello schema incompatibile `employee_id/status`.
PR privata #215: mantenuti richiesta esplicita di ricezione, tre categorie, tema/logo LTS e scelta delle due aree.

## Modifiche

- Revoca solo amministratore con MFA server-side: documento `archived`, PDF negato anche all'admin, audit con attore e timestamp; PDF e ricevute conservati.
- Conferma di ricezione richiesta, mai automatica: resta in attesa se l'autista esce; non attesta pagamento o accettazione degli importi.
- Chiusura della pagina e evento di blocco account chiudono l'anteprima; risposte elenco arrivate dopo il blocco vengono scartate.
- Overlay QA con selettore Area Logistica / Area Amministrativa e asset Napoli/porto/camion, preservando il modulo login e MFA QA.
- Corretto l'anchor ambiguo `</header>` dello script precedente: nel vero HTML QA esistono più header.
- Build Worker cambia solo manifest degli asset e CSP (API payroll QA e iframe blob), mantenendo byte per byte il verificatore Basic e il comportamento del Worker.

## Prove già eseguite

- CI precedente: cinque contesti CircleCI verdi sul candidato di partenza, senza rilancio.
- Suite Node dopo le modifiche funzionali: 409 test. 407 pass immediati; due test HTTP hanno avuto timeout di rete nell'esecutore. Ripetuti soltanto questi due con `NODE_USE_ENV_PROXY=1`: 2/2 pass. Nessuna modifica del codice per mascherare il problema.
- Database QA: 19 asserzioni reali in transazione (due driver e admin già esistenti), incluse ricevute/IDOR/bozze/revoca/idempotenza/audit/privilegi RPC. ROLLBACK di tutti i metadati sintetici. Non è un E2E HTTP autenticato.
- Edge QA v3: riletta e confrontata byte per byte con i quattro file candidati; JWT, sessione, MFA e WebAuthn invariati.
- Smoke HTTP QA: 204 / 401 / 401 / 403 / 403, rispettivamente preflight ammesso, JWT mancante, token falso, origine produzione vietata, header CORS non consentito.
- Worker preparato: 22 scenari con credenziali Basic sintetiche locali; 15 asset, CSP/no-store, gate e rifiuto contenuto corrotto. Non è un login al sito reale.
- Isolamento: su 13 Worker letti, soltanto `lts-test-pr205` usa KV `0442a91a117846509a3074c74ab08292`.
- Recupero: 84 asset precedenti riletti dal KV, decompressi, verificati per lunghezza e SHA-256. I 16 nuovi chunk sono aggiuntivi, senza sovrascrittura degli asset precedenti; 15 file nuovi/modificati verificati dopo scrittura.

## Rilascio QA e ripristino

Worker precedente: versione `db59f3dc-a940-4bac-8d74-6f9fcba46e16`.
Worker candidato: versione `ee9b136b-487f-46c3-a2ac-ad69921448ed`.
Il ripristino dell'interfaccia usa il deployment della versione precedente al 100%; gli asset KV rimangono disponibili. Usare l'endpoint deployments, non ricostruire segreti o binding.
Prima del cambio è stata verificata l'applicazione della versione baseline tramite deployment API; il rapporto nella Issue #220 documenta anche l'esito finale del ciclo di rollback.
Backend `lts-payroll-secure-qa` v3; schema aggiunto: sola RPC `lts_payroll_secure_qa_revoke` sulle tabelle QA già esistenti. Ripristino backend: sorgenti di `supabase/qa/functions/lts-payroll-secure-qa/` al commit precedente; RPC additiva può restare inutilizzata. Il vecchio servizio `lts-payroll` non viene modificato.

## Gate ancora bloccanti

1. Il browser disponibile non dispone delle credenziali Basic QA; il controllo non è stato aggirato o cambiato. Nessun login A/B o MFA reale attestato.
2. Nessun Android fisico accessibile: registrazione/sblocco/annullamento/scadenza/revoca/cambio telefono da provare in Chrome Android sull'origine QA esatta.
3. Nessun PDF sintetico ancora caricato via amministratore MFA: upload, visualizzatore Android, download, ricevuta persistente e isolamento tramite token reali ancora da provare. La validazione upload corrente controlla tipo/estensione/dimensione e firma `%PDF-`; non è una validazione completa della struttura PDF né una scansione malware.
4. LTS TEST baseline ha Booking disabilitato: i test di regressione del codice passano, ma non attestano il flusso Booking/Porti dal vivo in questa PWA QA.
5. Nuova CI richiesta sul commit consolidato; vedere stato corrente della PR e rapporto finale Issue #220.

Produzione non modificata. PR #193 deve rimanere Draft. Valutazione provvisoria 7/10: implementazione e controlli automatici avanzati, collaudo autenticato e Android mancanti.
