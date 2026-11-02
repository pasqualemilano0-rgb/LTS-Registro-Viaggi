# LTS Registro Viaggi — sito pubblico

[Apri LTS Registro Viaggi](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/)

App web per registrare viaggi, clienti e tariffe e generare il resoconto mensile.
La sezione **Porti** integra booking CONATECO/TFG e programma navi SCT, con lo stesso stile LTS. Con depot esterni OK, CONATECO mostra **INTERNO PORTO / DRYPORT**.

Aggiornamento del 2 novembre 2026: modulo portuale **v0.65**, monitor Cloudflare H24, gestione offline e dati delle ricerche separati dal registro. Le opzioni e lo stato della nave non autorizzano il singolo booking.

## Attivazione autisti con invito — 2 novembre 2026

Il sito web/PWA iPhone include **Attiva account** per l'autista e **Profilo → Gestisci autisti** per l'amministratore autenticato. L'amministratore inserisce nome, cognome e numero di cellulare; per i numeri italiani il prefisso **+39** è automatico.

L'amministratore genera un codice casuale monouso valido 24 ore e lo consegna privatamente. L'autista inserisce telefono e codice, quindi sceglie una password personale di **almeno 12 caratteri, con lettere e numeri**. La password viene gestita esclusivamente da Supabase Auth e non viene salvata in chiaro nel registro. Non è prevista la registrazione pubblica autonoma.

L'amministratore può controllare gli stati, annullare inviti e disattivare/riattivare i login. **Non esistono SMS automatici o verifica OTP del numero** in questa versione: il codice consegnato personalmente non prova il possesso della SIM.

Gli archivi dispositivo esistenti non vengono cancellati o trasferiti automaticamente. Questo rilascio riguarda il **sito web/PWA iPhone**, non il login nativo nell'APK Android. Le prove automatiche e le verifiche HTTP negative sono disponibili nel repository privato LTS; la prova completa con un autista reale è ancora da eseguire.

## Accesso autisti — integrazione facoltativa (2 novembre 2026)

La webapp/PWA offre anche **Accedi con account autista** nel Profilo, usando l'account già abilitato dall'amministratore. L'accesso è gestito da Supabase Auth e il registro dell'account viene letto da un archivio separato: il backend verifica su ogni richiesta l'identità, il ruolo e l'abilitazione. Non è consentita la registrazione pubblica di nuovi account.

**Compatibilità:** l'archivio precedente del dispositivo resta disponibile e non viene sostituito né unito automaticamente dopo il login. Per trasferirlo, esportare un backup, entrare nell'account e importarlo **manualmente con conferma**. Non eliminare i dati del browser prima di aver verificato una copia completa del registro. Se si esce dall'account, la copia personale rimane nel database e i dati dell'altro utente non vengono aperti automaticamente.

**Sicurezza e limiti:** i token dell'account rimangono nella sessione del browser, non nei backup o nei file pubblici. È necessaria una verifica online iniziale; senza connessione e senza una sessione già verificata, l'archivio protetto non viene aperto. Gli archivi dispositivo preesistenti restano un modello diverso, non protetto da account. L'APK Android nativo v14 non incorpora ancora il login Supabase; questo rilascio riguarda il sito/PWA. Restano da collaudare login con un utente reale e trasferimento di backup reale.

La documentazione tecnica e i test sono nel repository **privato** `LTS`, in `progetto-web-completo/docs-internal/account-supabase-integration-v1.md`. Non distribuire qui sorgenti backend, chiavi Supabase o registri personali.

Su iPhone aprire in Safari e scegliere **Condividi → Aggiungi alla schermata Home**.

[Guarda il video dimostrativo](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/video.mp4)

Una giornata di lavoro con Marco: esempi di inserimento, seconda presa, tariffe
e PDF. Filmato con voce sintetica italiana e dati dimostrativi.

Voce: Serena medium / Piper, modello addestrato da zero sul dataset sintetico
[Committa, serena-synthetic-it-27h](https://huggingface.co/datasets/committa/serena-synthetic-it-27h),
licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[Fonte del modello](https://huggingface.co/rhasspy/piper-voices/tree/main/it/it_IT/serena/medium).
La narrazione è stata generata per questa dimostrazione.

[Informativa privacy](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/privacy/)

Questo repository contiene soltanto i file necessari al sito e al suo promemoria.
I registri personali non sono pubblici e non sono inclusi nel repository.
