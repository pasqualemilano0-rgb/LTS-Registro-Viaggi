# LTS PR #216 — QA senza credenziali e gate di rilascio

**Decisione (23 novembre 2026):** i collaudi LTS ordinari non richiedono password, OTP, MFA, token o accesso personale all'utente. Non disattivare JWT, MFA, controlli di ruolo, RLS, CORS o il pilot per eliminare il login.

## Test automatici senza credenziali

- Eseguire con Node 22: node --test tests/qa-payroll-isolation-synthetic.test.mjs tests/qa-payroll-pdf-boundary.test.mjs. Lo stesso insieme gira già nel job CircleCI webapp-regression tramite node --test tests/*.test.mjs. Evitare pipeline extra.
- L'handler Edge viene eseguito in una VM con Supabase, utenti, sessioni e Storage sintetici. NESSUN endpoint reale contattato e NESSUN segreto necessario.
- Nuovi casi: mancanza di Authorization e bearer sconosciuto per list, drivers, publish, revoke, download, acknowledge; upload multipart anonimo. Esito richiesto: 401 e zero accessi allo Storage, documenti o audit.
- Nuove verifiche CORS: Origin assente/ostile, preflight con header o metodo vietato, GET negato, cache no-store. Il preflight valido 204 non concede accesso ai documenti.
- I test esistenti coprono già MFA simulata, JWT revocato, proprietà documenti tra autisti A/B, conferma una sola volta, revoca e controllo dei PDF pericolosi.
- I controlli database QA con ruolo anon/authenticated devono essere in sola lettura e terminare con ROLLBACK. Non creare o usare account reali.

## Limiti: cosa resta NOT RUN

Un test senza credenziali non certifica login Supabase reale, MFA TOTP, JWT valido ottenuto realmente dal server, upload con autenticazione, download conferma o revoca su Storage e PostgreSQL veri. Se manca un ambiente separato con identità sintetiche temporanee, segnare NOT RUN e lasciare bloccato il gate. Non simulare un risultato positivo in produzione.

Il Supabase QA condiviso è sywxretbfgwxwhvdcknq. Non alterare servizi TFG/Booking, vecchi account QA o bucket condivisi. LTS TEST Worker è stato rimosso: non ricrearlo. Non creare infrastruttura a pagamento senza consenso.

## Compatibilità PDF

I campioni non sensibili verificati comprendono PDF normale, scansione, modulo compilabile, ottimizzato e documento firmato con certificato sintetico. Sono negati PDF troncati, alterati, JavaScript, allegati, cifrati o object stream non supportati. Il validatore NON è un antivirus o un parser completo e può rifiutare PDF legittimi con oggetti compressi. Non includere buste paga reali nei test CI.

## Riferimento per il rollback — da ri-verificare al rilascio

La baseline verificata della funzione produttiva Supabase lts-payroll è versione 5, verify_jwt=true, bundle SHA 244858d06829533782b4e058727798c406cc9a54f446bcdc445ac53bf9f3a8af. Progetto produttivo otrqynkscpbeyuvdlgpg. I file index.ts, lts-session.mjs e lts-admin-mfa.mjs corrispondono byte per byte al commit pubblico 021712f9d2d005fdb3b57414df26b11a073d83a7.

Se dopo un futuro deploy si rileva una regressione, recuperare la versione precedente verificata, preservare verify_jwt=true, i segreti e il bucket privato, verificare JWT/MFA, upload in bozza, accesso e conferma PDF, revoca e audit. Non occorre una migrazione di database per la PR #216.

## Gate prima del merge e del deploy

1. Verificare 5/5 CircleCI verdi sullo SHA finale della PR, non su un commit precedente.
2. Controllare conflitti con PR attive e compatibilità dei PDF aziendali NON sensibili.
3. Eseguire integrazione con Auth e Storage reali ma account sintetici e ambiente isolato; altrimenti NOT RUN/BLOCKED.
4. Richiedere autorizzazione specifica al rilascio; produzione invariata fino ad allora.

**Stato:** PR #216 Draft. Nessun merge e nessun deploy. Test mock e controlli anonimi non sostituiscono l'E2E autenticato.
