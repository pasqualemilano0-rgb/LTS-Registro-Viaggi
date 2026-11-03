## Pannello amministratore autisti
Per gestire gli autisti aprire **https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/amministratore/**.
Login obbligatorio con l'account amministratore LTS. Permette inviti, blocco/riattivazione,
rimozione reversibile, reinserimento dello stesso numero e ripristino delle credenziali.
È una pagina statica; autorizzazioni e registri sono verificati nel backend Supabase.
Gli account e i viaggi non vengono cancellati durante la rimozione.
La versione APK Android del pannello resta da collaudare separatamente.

# LTS Registro Viaggi — sito pubblico

[Apri LTS Registro Viaggi](https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/)

App web per registrare viaggi, clienti e tariffe e generare il resoconto mensile.
La sezione **Porti** integra booking CONATECO/TFG e programma navi SCT, con lo stesso stile LTS. Con depot esterni OK, CONATECO mostra **INTERNO PORTO / DRYPORT**.

Aggiornamento del 2 novembre 2026: modulo portuale **v0.65**, monitor Cloudflare H24, gestione offline e dati delle ricerche separati dal registro. Le opzioni e lo stato della nave non autorizzano il singolo booking.

## Accesso autisti — obbligatorio nella PWA aggiornata (2 novembre 2026)

La webapp/PWA aggiornata richiede **numero e password di un account autorizzato** prima di aprire il registro. Gli account sono creati o attivati soltanto mediante l'amministratore. L'accesso è gestito da Supabase Auth e il registro dell'account viene letto da un archivio separato: il backend verifica su ogni richiesta l'identità, il ruolo e l'abilitazione. Non è consentita la registrazione pubblica di nuovi account.

**Compatibilità:** il vecchio archivio dispositivo resta conservato ma non è più accessibile anonimamente nella PWA aggiornata. Dopo il login usare **Profilo → Recupera archivio precedente** sullo stesso browser, con backup e conferma; per un file esterno JSON/ZIP la nuova funzione **Importa backup** propone un'unione senza sostituire automaticamente viaggi, clienti o tariffe già presenti. Se trova conflitti, blocca l'importazione. Non eliminare dati del browser né la vecchia app; la migrazione reale deve ancora essere verificata. Se si esce dall'account, la copia personale rimane nel database e i dati dell'altro utente non vengono aperti automaticamente.

**Sicurezza e limiti:** i token dell'account rimangono nella sessione del browser, non nei backup o nei file pubblici. È necessaria una verifica online iniziale; senza connessione e senza una sessione già verificata, l'archivio protetto non viene aperto. Gli archivi dispositivo preesistenti non sono necessariamente cifrati a riposo e le vecchie PWA/APK richiedono una migrazione controllata. L'APK Android nativo v14 non incorpora ancora il login Supabase; questo rilascio riguarda il sito/PWA. **L'accesso amministratore è stato verificato sul telefono**, ma restano da collaudare l'attivazione completa dell'autista e il trasferimento di backup con dati reali.

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

## Impostazione password amministratore via Gmail (2 novembre 2026)

Il primo amministratore era stato provisionato in Supabase Auth con un hash password, ma il titolare non aveva scelto una password nota; quindi non è appropriato tentare password casuali né crearne una in chat. La webapp espone ora **«Imposta o recupera password via Gmail»** nella schermata di login e la pagina **/LTS-Registro-Viaggi/recupera-password.html**.

Il titolare digita **solo sul sito HTTPS** la Gmail associata all'account: Supabase Auth invia un link che apre la pagina LTS, verifica il token di recupero e consente di sostituire la password. Il token vive solo in memoria del tab ed è rimosso immediatamente dall'URL. La nuova password va da 12 a 128 caratteri con lettere e numeri e viene controllata contro il database gratuito HIBP per mezzo dei **primi 5 caratteri dell'hash SHA-1**, con richiesta padding. Nessuna password viene scritta in backup, localStorage, GitHub o Drive; la password è inviata esclusivamente alla Auth API di Supabase.

**Configurazione necessaria da parte del proprietario**, prima di inviare email:
1. Supabase Dashboard → Authentication → URL Configuration: https://supabase.com/dashboard/project/otrqynkscpbeyuvdlgpg/auth/url-configuration
2. Configurare la **Site URL** pubblica HTTPS e aggiungere fra le **Redirect URLs** consentite l'indirizzo esatto `https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/recupera-password.html`.
3. Verificare che i messaggi Auth arrivino alla casella registrata (alcuni progetti Free necessitano SMTP personalizzato o hanno limiti di invio); controllare Spam. Non inviare link, OTP, password o token in chat.

**Aggiornamento:** il titolare ha impostato la password e mostrato la schermata amministrativa funzionante sul telefono; un collaudo end-to-end delle email in tutti i casi di errore resta da eseguire. Il controllo HIBP in questa schermata è un controllo **client-side**, non l'opzione integrata Supabase Auth Leaked Password Protection, che resta non disponibile nel piano Free. Gli inviti autisti restano protetti da verifica server-side separata; il warning Advisor rimane. Nessun utente/registro modificato da questo rilascio.
