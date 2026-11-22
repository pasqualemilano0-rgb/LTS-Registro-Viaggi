# LTS · Documenti paghe — handoff tecnico (PR di sviluppo, NON pubblicare)

## Ambito richiesto
- In **IL TUO PROFILO** dell'autista: **I MIEI DOCUMENTI** con **CEDOLINO**, **CU**, **ALTRI DOCUMENTI**.
- Indirizzo amministrativo distinto: \`/amministratore/buste-paga/\`, con accesso telefono/password e MFA già LTS.
- Sincronizzazione dell'anagrafica **su tutti gli autisti LTS attivi** tramite \`lts_account_access.user_id\` e \`lts_pending_drivers.auth_user_id\`, non tramite nomi modificabili.
- Archiviazione PDF nel bucket privato \`lts-payroll-private\` e metadati separati dal registro viaggi.
- Caricamento solo amministratore, sempre in **bozza**; pubblicazione puntuale dopo conferma; autista vede solo i documenti pubblicati per il suo account verificato.
- Massimo 8 MB per PDF; PDF non pubblicati mai visibili al lavoratore; nessun PDF nel repository o nel backup registro.

## File della feature
- \`documenti/index.html\`, \`documenti/driver-documents.mjs\`: archivio autista.
- \`amministratore/buste-paga/index.html\`, \`documenti/admin-documents.mjs\`: login distinto e gestione.
- \`documenti/document-api.mjs\`: transport autenticato e non cacheable.
- \`documenti/documents.css\`: tema LTS responsivo.
- \`supabase/migrations/20261118_private_payroll_documents.sql\`: schema staging da revisionare.
- \`supabase/functions/lts-payroll/{index.ts,lts-session.mjs,lts-admin-mfa.mjs}\`: endpoint protetto da JWT valido, sessione attiva, ruolo e MFA.
- Collegamenti da \`app.mjs\` e \`amministratore/index.html\`.

## Privacy e permessi
- Supabase service_role non deve comparire MAI nel codice browser.
- RLS attivato e senza policy anon/authenticated su tabelle paghe. Accesso solo via Edge Function server, che valida ogni JWT con \`getUser\`, la sessione attiva con \`lts_session_is_active\`, \`lts_account_access\`, e il secondo fattore per ruolo admin.
- Lettura dipendente: \`driver_id\` forzato dal token verificato, solo stato \`published\`; nessuna scelta arbitraria del destinatario.
- PDF scaricati dal server con \`Cache-Control: no-store\`; nessun URL di storage pubblico o di accesso firmato condivisibile.
- Il ruolo di amministratore può leggere i documenti aziendali caricati, ma **non** si prevede caricamento personale del 730 dal dipendente (richiederebbe una separazione ulteriore).
- Consultazione e gestione retention, riservatezza, diritti di accesso e conservazione con il consulente privacy prima dell'uso reale.
- L'endpoint non elabora cedolini né calcola retribuzioni.

## Rilascio — ordine OBBLIGATORIO
1. **NON fare merge** finché non è pronta una QA isolata. Nessuna modifica a Supabase di produzione, Booking TFG o Porti durante il test.
2. Applicare migrazione in **staging dedicato**, non nel Supabase QA Booking senza valutarne l'isolamento. Verificare bucket privato e policy neganti \`anon\`/\`authenticated\`.
3. Distribuire funzione \`lts-payroll\` con \`verify_jwt=true\`, variabili server solamente, origin GitHub Pages esatto. Non alterare funzioni LTS esistenti.
4. Testare con **due autisti fittizi A e B** e un admin: A non può elencare/scaricare file B; B non può elencare/scaricare A; autista non può eseguire upload/publish; admin non può operare senza MFA; token scaduti/revocati/utenti rimossi negati; CORS negato; PDF falso/rinominato negato; payload >8 MB negato; duplicato segnalato; bozza non visibile; pubblicato visibile solo al destinatario; logout immediato; riapertura Android; nessun download offline.
5. Testare revoca accessi, backup/ripristino e verificare che PDF non entrino nei vecchi archivi. Controllare log senza contenuti PDF.
6. Migliorare l'atomicità dell'audit per upload/pubblicazione (transazione SQL o trigger), la gestione anomalie, e un eventuale antivirus per file esterni prima del rilascio reale.
7. Collaudare CI esistente via CircleCI, verificare GitHub Actions budget 0 €, regressioni login, PDF viaggi, Porti, SCT, CNT, TFG, JWT, MFA e CORS.
8. Solo dopo esito positivo: migrazione produzione, deploy endpoint verificato, merge controllato della PR, controllo dal browser e smartphone con dati di prova, quindi attivazione utenti reali.

## Stato
Codice proposto su ramo feature; **non installato né verificato end-to-end**, **nessun PDF personale caricato**, nessun deploy Supabase o merge. Richiesta approvazione tecnica e privacy prima del go-live.

## Estensione: tracciabilità e ricevuta volontaria (18 novembre 2026)
- Tre eventi **distinti**: `published_at` (pubblicazione amministrativa), `first_accessed_at` (PDF recuperato dal server su richiesta dell'autista), `acknowledged_at` (tocco esplicito «Ho ricevuto il cedolino»).
- `first_accessed_at` non prova la lettura né l'arrivo del file sul dispositivo: è un evento del servizio dopo il download Storage ed è registrato prima della consegna HTTP completa.
- `acknowledged_at` è facoltativo e disponibile soltanto per `CEDOLINO` dopo il primo accesso; non è una firma elettronica del lavoratore, non prova il pagamento e non costituisce accettazione degli importi.
- Le date sono scritte dal **database**, mai ricevute dal browser; eventi iniziali idempotenti mediante RPC `lts_payroll_mark_first_access` / `lts_payroll_acknowledge`, consentite esclusivamente a service_role dopo i controlli Edge JWT/sessione/ruolo.
- Il trigger `lts_payroll_write_audit` registra primo accesso e conferma in modo atomico; i nuovi eventi sono persistenti nella tabella di audit separata dal registro viaggi.
- L'area admin mostra la cronologia sintetica per PDF; non indica «pagato» o «firmato».
- La pagina documenti admin impone **login separato** anche se una sessione LTS precedente esiste nella scheda, riutilizzando password e MFA del progetto.
- Test statici aggiunti in `tests/qa-payroll-documents.test.mjs`; servono ancora test DB con due autisti fittizi, idempotenza, blocco account revocati e verifica UX su browser/mobile.
- Non pubblicare prima di concordare con consulente del lavoro e responsabile privacy se la tracciatura adottata è sufficiente per dimostrare la consegna nel contesto aziendale. Nessuna firma obbligatoria è prevista.


## Decisione aggiornata 22 novembre 2026 — rimosso lo sblocco biometrico

- L'accesso a **I MIEI DOCUMENTI** richiede l'account autista LTS autenticato, il JWT Supabase validato dal server, la sessione attiva e non revocata, ruolo autista abilitato e controllo proprietario + documento published per ogni richiesta.
- Non è richiesto Face ID, impronta, PIN aggiuntivo, WebAuthn o passkey: la funzione non dipende più dal supporto biometrico del telefono.
- **Nessuna scorciatoia sui permessi:** A non deve leggere i PDF di B, le bozze e i documenti revocati restano negati. L'admin mantiene accesso separato e MFA obbligatoria.
- L'elenco dei documenti e l'anteprima PDF vengono cancellati/chiusi quando la pagina va in background o si perde la sessione; al ritorno viene verificata nuovamente la sessione LTS. I PDF già scaricati sul dispositivo restano sotto la responsabilità del dispositivo.
- Rimossi dal candidato frontend, API e migrazioni WebAuthn; le eventuali tabelle biometriche precedentemente create **nel solo Supabase QA** non vengono eliminate automaticamente.
- La conferma esplicita «Ho ricevuto il cedolino» dopo l'apertura del PDF resta obbligatoriamente proposta finché non confermata. Non equivale a pagamento o accettazione importi.
- QA richiesta: accesso A/B, separazione documenti, sessione revocata, admin MFA, PDF pubblicato/bozza/revocato, ricevuta, background/ripristino, nessuna cache privata e rollback. Il precedente collaudo WebAuthn Android non è più applicabile.
- Nessuna pubblicazione: PR in bozza fino alle prove E2E e autorizzazione specifica.

## Accesso amministrativo a due aree (18 novembre 2026)

- Nella pagina amministratore, **prima del login manuale**, vengono offerte due scelte: **AREA LOGISTICA** e **AREA AMMINISTRATIVA**.
- **AREA LOGISTICA** apre il modulo di accesso già usato da LTS Control Center, con credenziali, controlli ruolo, MFA, logistica, Porti, autisti, tariffe, viaggi e clienti inalterati.
- **AREA AMMINISTRATIVA** porta a /amministratore/buste-paga/ con login e MFA distinti; per ora comprende CEDOLINO, CU e ALTRI DOCUMENTI. Non concede automaticamente diritti payroll dalla scelta del pulsante.
- La selezione è una scelta di navigazione nel frontend, non un ruolo, un login unico o un modo per aggirare i controlli server. Se esiste già una sessione amministrativa verificata, rimane il normale ripristino rapido della dashboard LTS.
- Il pulsante Torna alla scelta delle aree cancella il campo password e gli eventuali errori del form logistico; il logout della dashboard ripresenta la selezione.
- Nuovi file amministratore/admin-area-choice.mjs, amministratore/admin-area-choice.css e tests/qa-admin-area-choice.test.mjs. Modificato solo il markup di accesso in amministratore/index.html; non modifica il motore di login amministratore in admin.mjs.
- Test statici/sintetici per le due opzioni, la separazione del login payroll con MFA e i click della scelta; da confermare comportamento su mobile/desktop e CircleCI al commit finale.
- **PR #193 IN BOZZA: non pubblicare né usare dati reali prima dei collaudi payroll e autorizzazioni.**


## Restyling di accesso approvato — Napoli, Porto e logo LTS originale

- La grafica del selettore amministratore è stata ridisegnata su riferimento visivo caricato dall'utente: logo aziendale rosso e azzurro, città di Napoli, Vesuvio, porto, navi e camion.
- Integrità logo: `assets/lts-logo.png` è esattamente il logo ufficiale fornito dall'utente (Git blob SHA-1 `168228cfb22738ed74a3115fc47d361b635f9308`), non il vecchio mockup argentato.
- L'interfaccia conserva le scelte AREA LOGISTICA e AREA AMMINISTRATIVA, accessi separati e MFA, impaginazione a due colonne su desktop e card verticali su smartphone.
- Assets grafici locali già versionati: `assets/admin-hero-napoli.svg`, `assets/admin-card-logistica.svg`, `assets/admin-card-amministrativa.svg` (Napoli/Porto/Vesuvio/camion in vettoriale), senza URL di fotografie esterne.
- Le foto originali dell'anteprima utente sono state preparate come file WebP ottimizzati nel pacchetto di consegna della chat; i file binari fotografici **non sono inclusi nella PR**. Sono previsti come sostituzione finale degli SVG, con commit binario verificabile.
- Modifiche a `amministratore/index.html` e `amministratore/admin-area-choice.css` limitate alla schermata di accesso; la CSS usa `body:has(#login-panel:not([hidden]) #admin-area-choice:not([hidden]))` per non modificare topbar/dashboard quando il login è già riuscito.
- `tests/qa-admin-area-choice.test.mjs` verifica logo ufficiale, immagini locali, mobile e isolamento della dashboard. `tests/company-report-browser.mjs` apre prima AREA LOGISTICA per mantenere il collaudo di visibilità password.
- Non unire né distribuire la PR #193 finché non passano i test browser e i collaudi di Supabase/permessi documentali.

\n## PDF + accesso con sessione LTS — correzioni QA 22/11/2026
- Il browser usa ESCLUSIVAMENTE `runtime-config.mjs > accountAuth.payrollEndpoint`, che deve puntare a `/functions/v1/lts-payroll` nella STESSA origin Supabase di `accountAuth.loginEndpoint`. Senza questa impostazione, accesso ai PDF fail-closed: nessun fallback automatico verso produzione o QA.
- Allestire il build LTS TEST con runtime accountAuth e CSP dedicati esclusivamente al progetto Supabase QA; non distribuire il runtime QA sul dominio ufficiale. Non inserirvi chiavi segrete.
- Sul deployment della Edge Function QA impostare `LTS_PAYROLL_ALLOWED_ORIGIN` all'origine HTTPS **esatta** della PWA QA (senza path). L'origine dev'essere esattamente autorizzata; una origin non configurata o diversa viene rifiutata.
- Solo sessione LTS verificata: non richiedere una seconda autenticazione biometrica. La UI nasconde l'elenco, chiude il PDF quando va in background e riconvalida la sessione al ritorno.
- Dopo il fetch di un PDF autorizzato viene mostrata una finestra con azioni esplicite **Visualizza PDF** e **Scarica PDF**; l'URL Blob è revocato alla chiusura. Per i cedolini non confermati, la richiesta di ricevuta è disponibile dopo la selezione dell'azione PDF, senza registrazioni automatiche; uscendo senza confermare lo stato resta in attesa. Non è firma né accettazione della paga.
- ATTENZIONE: database QA attuale corrisponde a PR #194 (employee_id/status), non a #193 (driver_id/state). Le migration non si possono applicare sovrapponendole. Prima di deploy QA consolidare lo schema o usare un ambiente isolato con database vuoto; non alterare il QA esistente automaticamente.
- Test da completare prima della pubblicazione: PWA Android reale, 2 autisti QA A/B con download incrociato negato, admin MFA, sessione revocata e cambio account, PDF falso e >8 MB, confirm/audit, rollback QA, regressioni Booking e Registro. Nessun merge o deploy autorizzato con soli test statici.
