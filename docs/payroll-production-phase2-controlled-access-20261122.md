# LTS — I MIEI DOCUMENTI | Fase 2: accesso di prova ristretto

**Data:** 22/11/2026. **Progetto Supabase:** produzione `otrqynkscpbeyuvdlgpg` (non QA). **PR:** #193 (ancora bozza). **Stato:** infrastruttura preparata, servizio non attivato, interfaccia autisti non pubblicata.

## Due blocchi indipendenti

1. `LTS_PAYROLL_ENABLED` deve essere letteralmente `yes`. Se non lo è, ogni richiesta viene respinta prima di elaborare origine, autenticazione o dati. Questa variabile **non è stata impostata** nel rollout e non è possibile leggerne il valore effettivo dal connettore; verificare il runtime con un test HTTP autorizzato prima di attivare qualsiasi accesso.
2. Anche con la variabile abilitata, **nessun ruolo** può usare l'API senza comparire in `public.lts_payroll_test_allowlist`, con `enabled=true`, ruolo uguale al ruolo LTS verificato e `expires_at` futuro. La tabella parte **senza righe**: non ci sono tester autorizzati. La query viene eseguita dopo `auth.getUser`, verifica account LTS e sessione non revocata, e MFA admin, ma prima di elenchi, upload, pubblicazione, conferme o download. Errori della query impediscono l'accesso.

La tabella ha **solo tre posti possibili**: `driver_a`, `driver_b`, `admin`, non trasferibili automaticamente da account amministrativi o di prova precedenti. Ciascuna autorizzazione dura al massimo 7 giorni. RLS attiva, nessuna policy diretta anon/authenticated, SELECT riservata a `service_role`. Creazione e assegnazioni soltanto con canale amministrativo autorizzato, mai dal browser.

## Attività completabili senza abilitare utenti

- Verificare che la funzione `lts-payroll` sia **v2** con `verify_jwt=true`, che il codice distribuito corrisponda al commit candidato e che contenga entrambi i blocchi.
- Verificare RLS/grant, bucket privato `lts-payroll-private`, conteggio tabella allowlist = **0**, paghe = **0**, audit = **0**. Il PDF non deve essere esposto tramite URL pubblico, link permanenti o signed URL.
- Verificare 5/5 CircleCI sul commit esatto della PR. I test sintetici possono confermare stato OFF, lista vuota, lista scaduta, separazione autisti, MFA e conferma prima di leggere Storage.
- La webapp ufficiale deve continuare **senza** `runtime.accountAuth.payrollEndpoint` e senza fare merge della PR #193.

## Verifiche ancora necessarie prima dell'accesso limitato

1. Selezionare e approvare **due identità test di autisti** e un amministratore di prova già autorizzato con MFA. Verificare che siano account previsti per i test, mai usare dipendenti arbitrari o credenziali di utenti sconosciuti.
2. Inserire manualmente **solo** i tre UUID autorizzati, rispettivamente negli slot `driver_a`, `driver_b`, `admin`, con ruolo corretto, `enabled=true` ed `expires_at` entro 7 giorni. Non includere UUID, credenziali o PDF in repo/issue/log.
3. Solo dopo la conferma operativa e controllo dello stato/backup, valutare l'attivazione del flag `LTS_PAYROLL_ENABLED=yes` per la durata del test. L'allowlist non dà accesso a tutti. Non configurare l'endpoint nel frontend pubblico.
4. Eseguire con token di sessione autorizzati prove HTTP dirette: non abilitato → diniego, accesso con account non in lista → 403, token non valido → 401, sessione revocata → diniego, admin senza MFA → diniego; autista A non legge B; bozza/revocato non accessibile; conferma richiesta prima del PDF; apertura post-conferma e ricevuta persistente; CU/ALTRI senza conferma specifica. Usare soltanto PDF sintetici, non dati personali reali.
5. Verificare l'anteprima su Android con un percorso di test che non alteri la webapp pubblica. Senza prove riuscite, non aprire il modulo agli autisti.

## Spegnimento e recupero

- **Non abilitare** la funzione di default. Per interrompere il test, rimettere `LTS_PAYROLL_ENABLED` a un valore diverso da `yes`, disabilitare le righe della lista, verificare che le chiamate siano negate e non aggiungere l'endpoint alla webapp. Anche con un errore sulla variabile, una lista vuota o scaduta nega tutti gli utenti.
- **Non ripristinare alla cieca v1**: v1 non ha il controllo allowlist. In ogni eventuale rollback verificare prima che `LTS_PAYROLL_ENABLED` non sia `yes`; mantenere il blocco preventivo.
- Non cancellare documenti, tabelle o storici al termine dei test senza piano specifico di conservazione. La revoca di un documento non distrugge il PDF o la cronologia delle ricevute.

## Interpretazione degli esiti

Il test negativo del backend **non è certificato** dalla sola lettura del codice: occorre una richiesta HTTP reale e autorizzata al servizio. I test CI con mock verificano solo le condizioni previste nel sorgente. La conferma del cedolino attesta la messa a disposizione, non lettura, firma, pagamento o accettazione delle somme.
