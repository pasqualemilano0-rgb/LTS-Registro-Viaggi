# LTS Registro Viaggi — sito pubblico

[Apri LTS Registro Viaggi](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/)

App web per registrare viaggi, clienti e tariffe e generare il resoconto mensile.
La sezione **Porti** integra booking CONATECO/TFG e programma navi SCT, con lo stesso stile LTS. Con depot esterni OK, CONATECO mostra **INTERNO PORTO / DRYPORT**.

Aggiornamento del 2 novembre 2026: modulo portuale **v0.65**, monitor Cloudflare H24, gestione offline e dati delle ricerche separati dal registro. Le opzioni e lo stato della nave non autorizzano il singolo booking.

## Accesso autisti — integrazione facoltativa (2 novembre 2026)

La webapp/PWA offre anche **Accedi con account autista** nel Profilo, usando l'account già abilitato dall'amministratore. L'accesso è gestito da Supabase Auth e il registro dell'account viene letto da un archivio separato: il backend verifica su ogni richiesta l'identità, il ruolo e l'abilitazione. Non è consentita la registrazione pubblica di nuovi account.

**Compatibilità:** l'archivio precedente del dispositivo resta disponibile e non viene sostituito né unito automaticamente dopo il login. Per trasferirlo, esportare un backup, entrare nell'account e importarlo **manualmente con conferma**. Non eliminare i dati del browser prima di aver verificato una copia completa del registro. Se si esce dall'account, la copia personale rimane nel database e i dati dell'altro utente non vengono aperti automaticamente.

**Sicurezza e limiti:** i token dell'account rimangono nella sessione del browser, non nei backup o nei file pubblici. È necessaria una verifica online iniziale; senza connessione e senza una sessione già verificata, l'archivio protetto non viene aperto. Gli archivi dispositivo preesistenti restano un modello diverso, non protetto da account. L'APK Android nativo v14 non incorpora ancora il login Supabase; questo rilascio riguarda il sito/PWA. Restano da collaudare login con un utente reale e trasferimento di backup reale.

### Attivazione autisti con invito (web/iPhone)

L'amministratore gia autenticato vede **Profilo → Gestisci autisti**: può emettere un codice monouso di 24 ore, consultare i propri autisti, revocare inviti e disattivare o riattivare un autista. Il codice va consegnato privatamente dal titolare; **nessun SMS viene inviato automaticamente**. L'autista usa **Hai un invito? Attiva account**, il proprio telefono e il codice, e sceglie la password personale in Supabase Auth. La nuova password non viene mostrata all'amministratore né salvata nel registro.

**Requisiti attuali:** 12–128 caratteri con lettere e numeri, non 6. Un invito non prova il possesso della SIM; il numero non è verificato tramite OTP. Prima della prima emissione reale, l'amministratore deve effettuare un login verificato; il collegamento completo non è ancora collaudato con utenti reali. L'APK Android nativo resta fuori da questo rilascio. Nessun archivio precedente viene cancellato, migrato o unito automaticamente.

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
