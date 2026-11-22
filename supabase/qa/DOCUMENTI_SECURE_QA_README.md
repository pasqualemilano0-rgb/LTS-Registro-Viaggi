# LTS — I MIEI DOCUMENTI | Rilascio QA, conferma prima del PDF

**Ambito esclusivo:** progetto Supabase QA `sywxretbfgwxwhvdcknq`, funzione `lts-payroll-secure-qa`. **NON usare il progetto di produzione** `otrqynkscpbeyuvdlgpg` o la funzione `lts-payroll`. PR pubblica #193 resta in bozza. Nessun dato personale reale.

## Stato verificato il 22/11/2026

- La funzione QA online è **v4 ACTIVE**, con `verify_jwt=false` come configurazione preesistente; **il codice al suo interno verifica comunque JWT con `auth.getUser`, sessione attiva, ruolo e MFA admin**. Non cambiare queste verifiche né usare `verify_jwt=false` per saltare l'autenticazione applicativa.
- La **migration `lts_payroll_confirm_before_pdf_qa_20261122` è già applicata**. Il database richiede `acknowledged_at` prima di registrare `first_accessed_at` per il cedolino; le RPC sono riservate a `service_role`, senza EXECUTE a `anon` o `authenticated`. Zero documenti nelle tabelle QA al controllo.
- La PR #193 include **il nuovo codice della Edge**: risposta HTTP 409 prima di leggere Storage se un autista richiede un cedolino non confermato. Il frontend chiama `acknowledge` prima di `download`. CU e ALTRI non richiedono conferma aggiuntiva.
- Test SQL su progetto QA: `tests/qa-payroll-db-transaction.sql` **PASS e ROLLBACK**; suite CircleCI sul SHA `20e07fd199bc1ae88b17b3f51b04aeff36740fb5` **5/5 SUCCESS**.
- **ATTENZIONE: la nuova funzione Edge non è stata distribuita.** Il tentativo è stato bloccato dai controlli di esecuzione del servizio. Non interpretare la migrazione SQL o i test sintetici come un E2E reale; non usare un percorso alternativo per aggirare la restrizione.

## Procedura per rilascio QA autorizzato

Da eseguire esclusivamente da un operatore/ambiente con permessi di deploy approvati, in una copia di lavoro verificata della PR #193. Prima di procedere controllare il ref Supabase ed eseguire `supabase functions deploy --help` con la versione CLI installata. Non salvare token, chiavi o documenti nel repository.

1. Verificare che siano presenti **solo account e PDF sintetici**; che il progetto sia `sywxretbfgwxwhvdcknq`; che la funzione `lts-payroll-secure-qa` online sia ancora v4 e che non siano intervenuti aggiornamenti concorrenti.
2. Salvare una copia dei **tre file distribuiti della v4** (`index.ts`, `lts-session.mjs`, `lts-admin-mfa.mjs`) e la configurazione JWT per rollback. Riferimento storico del precedente candidato: `0acdd37bb96cd79b41b63a4b268bc3e9527748f2`. Confrontare il backup effettivamente distribuito, non presumere che la sola revisione Git sia sufficiente.
3. Preparare una directory temporanea di deploy con **solo** questi tre file, copiati da `supabase/qa/functions/lts-payroll-secure-qa/`, sotto `supabase/functions/lts-payroll-secure-qa/` della directory temporanea. Non copiare né distribuire `supabase/functions/lts-payroll` di produzione.
4. Verificare il diff: `lts-session.mjs` e `lts-admin-mfa.mjs` devono essere identici alla v4; `index.ts` deve avere la verifica pre-PDF prima di `storage.download`. Configurazione `verify_jwt` invariata; JWT obbligatorio tramite applicazione.
5. Eseguire il deploy della **sola** `lts-payroll-secure-qa` verso `sywxretbfgwxwhvdcknq` con CLI/console autorizzata, confermando il progetto e la funzione nella richiesta di deploy. Il comando CLI, dalla directory temporanea contenente `supabase/functions`, è:

   ```sh
   supabase functions deploy lts-payroll-secure-qa --project-ref sywxretbfgwxwhvdcknq --no-verify-jwt
   ```

   Il flag `--no-verify-jwt` riproduce la configurazione **già presente** della Edge QA; non rimuove e non deve rimuovere `auth.getUser` e `checkLtsSession` dal codice. Non eseguire `--prune` né un deploy senza nome della funzione.
6. Dopo deploy, **rileggere i sorgenti distribuiti** e verificare la nuova versione ACTIVE, i moduli JWT/MFA invariati e il blocco prima di leggere Storage. Se l'operazione fallisce o gli asset non corrispondono, non abilitare la pagina autista.
7. Testare con token realmente autenticati di due autisti QA A/B e admin QA con MFA: senza conferma `download` cedolino = 409 e nessun PDF; `acknowledge` proprietario = 200; dopo conferma `download` = 200 e PDF corretto; altro autista = 403/409; bozza e revocato sempre negati; CU/ALTRI senza conferma; JWT scaduto/revocato, admin senza MFA e cambio account bloccati. Collaudare il flusso dal browser Android e verificare audit.
8. Solo dopo questi esiti, valutare separatamente il merge e il rilascio in produzione: **non è automatico**.

## Rollback QA

Se test o confronto sorgenti falliscono, **ripristinare la precedente versione v4 della sola funzione QA** usando il backup dei tre file e la configurazione originale, quindi rileggere la versione attiva. **Non eliminare** la Edge, le tabelle QA o i documenti con un comando distruttivo. Non eseguire rollback di migrazioni in automatico: la migration QA già applicata è fail-closed per i cedolini senza conferma; la compatibilità del frontend va gestita esplicitamente.

## Regola della ricevuta

La conferma prima del PDF attesta esclusivamente la **messa a disposizione**, non prova la lettura del documento, un pagamento, una firma o l'accettazione degli importi. `acknowledged_at` e `first_accessed_at` sono eventi distinti.
