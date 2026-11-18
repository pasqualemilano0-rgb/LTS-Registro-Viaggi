# PR #191 — Gate di sicurezza e rilascio

Stato: **Draft / NON DISTRIBUIRE** finché i controlli sotto non sono soddisfatti.
Questa nota accompagna la PR pubblica; non modifica il repository privato né la produzione.

## Risultati confermati (18 novembre 2026)

- CircleCI: 5/5 controlli verdi sul commit `6612c5392a919b6067f9b17bea544b9a829c3cdd`.
- Supabase produzione: la tabella `public.lts_company_multi_stop_fares` non esiste; migrazione `20261118102700` non applicata.
- Il controllo frontend aggiorna online il catalogo prima di salvare una nuova tariffa unica. È una protezione UX, non un controllo di autorizzazione server attendibile.
- La funzione `lts-account-state` del backend privato controlla autenticazione, sessione, RLS dell'archivio, revisione e forma dell'archivio. Prima del rilascio richiede un'ulteriore verifica server-side dell'autorizzazione della coppia e dell'importo: la convalida strutturale del JSON non basta.

## Contratto richiesto al backend (repository privato; da sviluppare e revisionare separatamente)

1. In fase di scrittura dell'archivio, identificare il precedente stato tramite l'UID autenticato e la revisione CAS; non fidarsi di importi, modalità, identità o approvazioni dichiarate dal browser.
2. Per ogni viaggio nuovo oppure modificato da modalità doppia a **due sedi / tariffa unica**, verificare in database una coppia *ordinata* attiva, comprensiva di entrambe le località. Il prezzo del viaggio deve coincidere con il valore autorizzato al momento del salvataggio; `secondFareCents` deve essere `null`.
3. Per un viaggio storico già a tariffa unica, mantenere l'importo fotografato se ID viaggio, coppia ordinata, modalità e importo sono invariati. Consentire modifiche non economiche senza ricalcolare il passato. Vietare la modifica opportunistica dell'importo di uno storico.
4. Rifiutare nuove tariffe uniche dopo revoca o variazione dell'autorizzazione, anche se il client ha una copia del catalogo in cache o una sincronizzazione offline in coda. I controlli devono applicarsi anche ad importazioni, ripristini e altri percorsi di scrittura dell'archivio.
5. Convalidare stato precedente, autorizzazioni correnti e nuova revisione **in modo atomico** rispetto alla scrittura, per evitare finestre di gara fra disattivazione, cambio prezzo e salvataggio.
6. Lasciare intatta la modalità esistente **due clienti / due tariffe** e i record storici; non cambiare JWT, MFA, controllo sessione, separazione utenti, Booking TFG, Porti, cron, KV o Cloudflare.
7. Mantenere solo le autorizzazioni server necessarie: nessuna nuova policy che conceda accesso alla tabella tariffaria a `anon` o `authenticated`; nessuna chiave `service_role` nel browser.

## Matrice minima di collaudo

| Caso | Risultato richiesto |
| --- | --- |
| Coppia approvata, prezzo esatto | Accetta il nuovo viaggio a tariffa unica |
| Coppia assente, disabilitata, ordine invertito o località differente | Rifiuta il nuovo viaggio a tariffa unica |
| Prezzo client diverso dal prezzo amministrativo | Rifiuta |
| Catalogo obsoleto / write offline accodato dopo revoca | Rifiuta al server, conserva bozza e segnala il conflitto |
| Storico a tariffa unica, stessi punti e importo invariato | Conserva lo snapshot |
| Storico con importo alterato dal client | Rifiuta |
| Due clienti con due tariffe | Continua a funzionare |
| Nuova migrazione + Edge Function con JWT valido / scaduto, driver / admin MFA | Solo gli accessi previsti sono autorizzati |
| PDF e report mensile | Una riga e un solo compenso per il container a tariffa unica; nessun cambiamento al tema PDF |
| Android, web e ripristino cache | Nessuna selezione o prezzo obsoleto accettato come nuova autorizzazione |

## Sequenza di distribuzione dopo collaudo

1. Implementare e testare il gate backend in ambiente isolato con dati fittizi; non modificare la PR privata #205.
2. Revisionare migrazione, RLS, ruoli, MFA e autorizzazioni. Applicare migrazione alla produzione soltanto con piano di rollback verificato.
3. Pubblicare le funzioni server compatibili con client precedenti e verificare che il gate sia attivo.
4. Allineare questo ramo con `main` (che contiene aggiornamenti dati Porti non sovrapposti), poi ricontrollare CircleCI.
5. Solo con controlli positivi, unire la PR e pubblicare la PWA. Eseguire collaudo Android reale con una coppia di prova, senza dati personali sensibili.
6. Verificare report/PDF e monitoraggio post-rilascio. In caso di errore ripristinare prima webapp e funzioni, conservando la tabella e gli eventuali dati reali fino a valutazione.

**Criterio GO:** backend autorizzativo verificato + migrazione/Edge verificati + CI verde sull'ultimo commit + test Android e PDF passati.
