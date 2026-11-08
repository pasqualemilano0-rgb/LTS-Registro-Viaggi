# LTS Registro Viaggi — Piano di qualità 10/10
**Stato:** implementazione incrementale, 8 novembre 2026  
**Ambito:** dashboard amministratore + registro personale + condivisione clienti, senza modifiche distruttive agli archivi esistenti.

> 10/10 non è un'etichetta estetica. Significa superare controlli ripetibili su integrità dei dati, sincronizzazione, autorizzazioni, velocità e usabilità mobile. Una build pubblicata su GitHub non dimostra, da sola, che tutti questi criteri siano soddisfatti.

## Audit dei problemi più rilevanti
- Schede "Clienti personali" alte: troppe informazioni sempre visibili e poco spazio per scorrere.
- Nessun filtro operativo nell'archivio personale per distinguere clienti senza indirizzo, possibili duplicati e sedi già condivise.
- Certificazione Google Maps disponibile solo dentro la modifica; richiedeva passaggi aggiuntivi per arrivarci.
- Importi incompleti presenti nei viaggi, ma senza un filtro dedicato nell'archivio amministrativo.
- Rischio di confondere una somiglianza tra nomi con un'identità di sede: confronto prudente necessario.
- Stati di sincronizzazione disparati: evitare statistiche e etichette "verificato" quando la lista condivisa non è stata recuperata.
- Mancanza di una matrice esplicita di test Android reali e di un gate di accettazione misurabile.

## Priorità P0 — Correttezza, sicurezza, resilienza (peso 4/10)
**Presente nel repository; test di produzione ancora necessari.**
- [x] Le correzioni degli archivi richiedono amministratore autenticato, MFA, revisione attesa e audit lato server.
- [x] I conteggi dei viaggi riutilizzano le regole condivise in `shared/domain.mjs`, non formule duplicate nella dashboard.
- [x] "Sabato trasferta" resta conteggiato una sola volta per data; nessun servizio viene cancellato dal record originale.
- [x] Certificazione Google Maps: confronto nome, città e indirizzo; nessuna eliminazione senza conferma e risposta server.
- [x] Se la verifica dei clienti condivisi non riesce, la UI segnala "non verificato", non presenta zero duplicati come certezza.
- [ ] Eseguire un collaudo browser Android con sessione amministratore di prova: MFA, conflitto di revisione, disconnessione e ripristino da audit.
- [ ] Verificare permessi e timeout in tutti i flussi con il servizio reale, senza utilizzare dati di clienti veri nei test.

**Criterio di accettazione:** 0 perdite di dati, 0 eliminazioni non confermate, 0 ricalcoli involontari di importi storici, 0 accessi ai dati altrui.

## Priorità P1 — Operatività mobile (peso 2/10)
**Miglioramenti implementati nella sessione corrente.**
- [x] Card clienti compatte con nome, sede, indirizzo e stato; telefono/partita IVA in "Altri dati".
- [x] Pulsante immediato "Certifica Maps" con focus sul campo link Google Maps.
- [x] Filtri: Tutti / Da verificare / Senza indirizzo / Possibili duplicati / Già condivisi.
- [x] Barra qualitativa: indirizzi mancanti, possibili duplicati e sedi già condivise.
- [x] Filtro viaggi "Importi da completare", costruito con le regole di calcolo esistenti.
- [x] Ricerca in archivio senza distinzione tra maiuscole/minuscole e accenti; ricerca per note, P.IVA, container e altri campi.
- [x] Componenti in stile LTS approvato, tap target adatti al telefono, filtri orizzontali sulle larghezze ridotte.
- [ ] Prova reale a 360px, 390px, 768px e desktop con tastiera, TalkBack e diverse dimensioni del carattere.
- [ ] Ridurre ulteriormente i passaggi delle azioni più frequenti solo sulla base di prove d'uso.

**Criterio di accettazione:** l'amministratore trova il cliente incompleto e arriva alla verifica Maps in non più di 3 tocchi dalla categoria "Clienti personali", senza perdere modifiche non salvate.

## Priorità P2 — Dati condivisi e qualità anagrafiche (peso 1.5/10)
- [x] Segnalazione prudente delle corrispondenze: **Già condiviso** richiede identità di nome, comune e indirizzo; lo stesso nome in una città non basta.
- [x] Sedi non verificabili restano separate; possibile duplicato non vuol dire duplicato certo.
- [x] Il filtro non elimina né trasforma i clienti personali e non modifica i viaggi.
- [ ] Testare con sedi multiple, indirizzi segnaposto, link Google Maps abbreviati, nomi societari alternativi e clienti manuali condivisi.
- [ ] Definire un flusso di revisione amministrativa per alias societari senza automatizzare cancellazioni basate su similarità.

**Criterio di accettazione:** nessuna fusione automatica di depositi differenti o perdita di indirizzi / tariffe.

## Priorità P3 — Analisi e report affidabili (peso 1/10)
- [x] Esistono dashboard analitica, filtri e report PDF/Excel in LTS; non duplicarli.
- [ ] Confrontare esportazioni vs. somme del registro per periodo e autista, inclusi extra, doppie prese e giorni con più viaggi.
- [ ] Esporre con chiarezza conteggi parziali e periodo di riferimento; non chiamare "fatturato" gli importi delle trasferte.
- [ ] Testare file Excel/PDF lunghi e con caratteri accentati.

**Criterio di accettazione:** nessuna discrepanza tra grafici, archivio, PDF ed Excel per gli stessi filtri; avviso esplicito se alcuni dati non sono sincronizzati.

## Priorità P4 — Offline, performance e accessibilità (peso 1.5/10)
- [x] Versione della PWA aggiornata per forzare il caricamento degli asset del nuovo tema.
- [x] Il codice di interfaccia usa API DOM sicure, senza inserimento di HTML remoto o dati cliente in memoria condivisa.
- [x] Aggiunti test unitari su qualità, ricerca, duplicati, tariffe mancanti e regola del sabato.
- [ ] Simulare 1.000/10.000 viaggi e misurare rendering, ricerca e memoria sul telefono.
- [ ] Audit accessibilità WCAG 2.2 AA e navigazione solo tastiera.
- [ ] Testare online → offline → edit → riapertura → riconnessione → conflitto senza perdita dei record.
- [ ] Confermare il caricamento dopo aggiornamento service worker e cancellazione della cache vecchia.

**Criterio di accettazione:** nessuna perdita offline, nessuna schermata bloccata, testi e controlli utilizzabili a 200% di zoom, stato di sincronizzazione comprensibile.

## Gates obbligatori prima di dichiarare "10/10"
1. **CI verde:** sintassi dei moduli + test di dominio e accesso + test dei nuovi filtri, senza segreti nel frontend.
2. **Test dati:** campioni anonimi per integrazione da 0 / 1 / 1.000+ viaggi, con valori nulli, extra e doppie prese.
3. **Test di integrazione:** backend MFA, revisione CAS, audit e recupero, in ambiente di prova.
4. **Test dispositivo:** Android Chrome/PWA, iPhone Safari e desktop; orientamento, caratteri ingranditi e rete intermittente.
5. **Approvazione funzionale:** prova di modifica e certificazione cliente, annullamento, cliente duplicato, cliente con stessa città ma sede diversa.
6. **Monitoraggio post-release:** tasso errori e regressioni su navigazione, importazione, salvataggio, esportazioni.

## File della fase corrente
- `amministratore/records-intelligence.mjs`: regole pure per filtri e KPI.
- `amministratore/driver-records.mjs`: UI con filtri, badge e certificazione Maps rapida.
- `amministratore/index.html`: sezione controlli rapidi.
- `visual-theme.css`: layout mobile compatto.
- `tests/records-intelligence.test.mjs`: regressioni su filtri e importi.
- `.github/workflows/qa-account-release.yml`: sintassi e test in CI.

### Valutazione
**Prima:** 7,5/10 (stima qualitativa, non benchmark).  
**Dopo questa fase:** UX più completa, ma il **10/10 non è ancora dimostrato** finché i gate sopra non sono tutti soddisfatti. Il rilascio viene valutato sui risultati dei test, non sul numero di funzionalità aggiunte.
