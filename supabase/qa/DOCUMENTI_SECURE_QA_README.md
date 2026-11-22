# LTS — Documenti PDF e passkey in Supabase QA

**Solo QA:** progetto `sywxretbfgwxwhvdcknq`. Produzione `otrqynkscpbeyuvdlgpg` esclusa.
Questo pacchetto preserva `lts_payroll_documents`, `lts_payroll_audit`, `lts-payroll-private` e la funzione `lts-payroll` originale del progetto QA.

## Deployment isolato
1. Verificare esistenza 2 autisti sintetici + 1 admin MFA, nessun dato personale nel progetto QA.
2. Applicare `20261122_secure_payroll_qa.sql` creando tabelle e bucket distinti, senza toccare quelli esistenti.
3. Applicare `20261122_payroll_webauthn_qa.sql` per passkey, challenge monouso e unlock di 180 s.
4. Distribuire una **nuova** funzione `lts-payroll-secure-qa`, usando codice PR #193 (JWT + sessione, WebAuthn, riservatezza) con riferimenti alle tabelle/bucket QA dedicati e origin HTTPS **esatta** `https://lts-test-pr205.pasqualemilano0.workers.dev`.
5. Collegare la PWA QA al nuovo endpoint solo dopo il test di origin, CSP e login QA. La produzione non deve conoscere il nuovo endpoint.

## Test obbligatori
- Login per i due autisti A/B e admin QA con MFA; A non legge B e viceversa, bozze/revocati non leggibili.
- Senza passkey sbloccata, list/download/acknowledge => 423; JWT revocato => 403.
- WebAuthn autentico su Android: prima registrazione, nuova passkey, challenge scaduta e riuso negati, background blocca, 3 minuti massimi.
- PDF sintetico: carica in bozza, pubblica, scarica, registra primo accesso, conferma manuale e audit senza automatismi.
- CSP e servizio PDF vincolati all'origine QA; dopo cambio release verificare sessioni e accesso admin.
- Regressioni: Booking TFG, Porti, JWT/MFA, PDF Registro Viaggi. Non abilitare rollout ufficiale senza gate completi.

## Rollback
Disabilitare frontend QA della funzione, eliminare soltanto la nuova Edge Function e, se necessario, rimuovere le sole tabelle/bucket `*_secure_qa` **dopo verifica che siano vuoti e non contengano PDF di prova da conservare**. Non rimuovere gli oggetti della versione QA precedente.
Le migrazioni sono preparatorie e da sole non certificano la sicurezza del flusso PDF.
