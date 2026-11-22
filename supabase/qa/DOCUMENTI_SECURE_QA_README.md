# LTS — Documenti PDF riservati con sessione LTS in Supabase QA

**Solo QA:** progetto `sywxretbfgwxwhvdcknq`. Produzione `otrqynkscpbeyuvdlgpg` esclusa.
Questo pacchetto preserva `lts_payroll_documents`, `lts_payroll_audit`, `lts-payroll-private` e la funzione `lts-payroll` originale del progetto QA.

## Deployment isolato
1. Verificare esistenza 2 autisti sintetici + 1 admin MFA, nessun dato personale nel progetto QA.
2. Applicare `20261122_secure_payroll_qa.sql` creando tabelle e bucket distinti, senza toccare quelli esistenti.
3. Non applicare la migrazione WebAuthn del vecchio candidato: è stata ritirata. Eventuali tabelle WebAuthn storiche rimangono inattive nel progetto QA fino a inventario e pulizia approvati.
4. Distribuire una **nuova** funzione `lts-payroll-secure-qa`, usando codice PR #193 (JWT + sessione attiva, controllo proprietario, MFA admin e riservatezza) con riferimenti alle tabelle/bucket QA dedicati e origin HTTPS **esatta** `https://lts-test-pr205.pasqualemilano0.workers.dev`.
5. Collegare la PWA QA al nuovo endpoint solo dopo il test di origin, CSP e login QA. La produzione non deve conoscere il nuovo endpoint.

## Test obbligatori
- Login per i due autisti A/B e admin QA con MFA; A non legge B e viceversa, bozze/revocati non leggibili.
- Senza JWT valido, sessione verificata e ruolo abilitato, l'accesso è negato. Il JWT revocato dà 403; l'utente A non può leggere i documenti di B. Il server non richiede WebAuthn.
- Browser Android reale: accesso con LTS, riapertura, sessione scaduta/revocata, cambio account e background che chiude l'anteprima; nessuna dipendenza dal supporto biometrico.
- PDF sintetico: carica in bozza, pubblica, scarica, registra primo accesso, conferma manuale e audit senza automatismi.
- CSP e servizio PDF vincolati all'origine QA; dopo cambio release verificare sessioni e accesso admin.
- Regressioni: Booking TFG, Porti, JWT/MFA, PDF Registro Viaggi. Non abilitare rollout ufficiale senza gate completi.

## Rollback
Disabilitare frontend QA della funzione, eliminare soltanto la nuova Edge Function e, se necessario, rimuovere le sole tabelle/bucket `*_secure_qa` **dopo verifica che siano vuoti e non contengano PDF di prova da conservare**. Non rimuovere gli oggetti della versione QA precedente.
Le migrazioni sono preparatorie e da sole non certificano la sicurezza del flusso PDF.

## Stato del servizio QA precedente
La Edge Function QA distribuita in precedenza può ancora richiedere WebAuthn. La modifica del codice nella PR #193 **non** aggiorna automaticamente l'istanza distribuita: il nuovo contratto di accesso deve essere collaudato e promosso su ambiente QA isolato, preservando rollback e senza modificare la produzione.
