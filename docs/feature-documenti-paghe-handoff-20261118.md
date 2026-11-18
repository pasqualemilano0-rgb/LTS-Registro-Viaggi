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


## Estensione: sblocco dispositivo / passkey per I MIEI DOCUMENTI

- Ambito: tutte le categorie CEDOLINO, CU e ALTRI DOCUMENTI. La UI rimane bloccata; anche il backend impedisce list/download/acknowledge senza WebAuthn.
- Tecnologia: WebAuthn/passkey, userVerification required. Sistema operativo e browser scelgono Face ID, impronta o PIN. Non si raccolgono dati biometrici, fotografie o PIN.
- Prima registrazione: account autista LTS già verificato più reinserimento password LTS validata dal backend Supabase Auth per lo stesso user_id. Rate limit server 5 tentativi ogni 15 minuti.
- Nuovo telefono: pulsante Registra nuova passkey nella schermata protetta, sempre con reimmissione della password LTS. Massimo cinque passkey attive.
- Origin WebAuthn: https://pasqualemilano0-rgb.github.io; RP ID pasqualemilano0-rgb.github.io. Libreria server pin npm:@simplewebauthn/server@13.3.0.
- Challenge WebAuthn a consumo singolo e validità 90 secondi, legata a user_id e session_id LTS. Il server verifica firma, challenge, RP ID, origin e UV.
- Sblocco: token casuale di 32 byte, conservato soltanto nella memoria della pagina; SHA-256 sul server, legato alla sessione e alla passkey non revocata. Scadenza lato server entro 3 minuti.
- Protezione: blocco UI e cancellazione elenco immediati quando app va in background, sessione scade, browser ripristina pagina; richiesta di revoca sblocco lato server.
- Nessuna via alternativa a password-only se il dispositivo non supporta WebAuthn con sblocco schermo. L'admin mantiene password/MFA già previste.
- Nota privacy: il blocco protegge soltanto l'area LTS, non i PDF già scaricati nella cartella Download del dispositivo.
- Nuovi file: documenti/device-passkey.mjs, supabase/functions/lts-payroll/device-unlock.mjs, supabase/migrations/20261118_payroll_device_unlock.sql, tests/qa-payroll-device-lock.test.mjs.
- QA prima di produzione: Android Chrome, iOS Safari, assenza WebAuthn, Face ID/PIN annullato, dispositivo nuovo, password errata e throttling, riutilizzo challenge, JWT revocato/rubato, accesso tra due autisti A/B, blocco background e dopo 3 minuti, download offline, RLS, Storage, CORS, regression Booking TFG/Porti.
- STATO: soltanto PR di sviluppo. Nessun deploy o modifica a Supabase di produzione, nessun PDF reale caricato. Non pubblicare senza QA end-to-end.
