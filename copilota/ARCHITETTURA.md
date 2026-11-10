# LTS Copilota — roadmap e confini di sicurezza

## Stato v0.1
Prototipo isolato in `/copilota/` (branch dedicato, non collegato alla dashboard). Suggerimenti deterministici, solo in memoria. **Non è ancora una IA online**. Non legge dati aziendali, non invia richieste, non registra viaggi. Nessuna chiave API. Nessuna chiamata di rete. Il prototipo non deve essere considerato una funzionalità operativa degli autisti.

## Architettura futura
- Frontend GitHub Pages: interfaccia accessibile solo dopo sessione verificata, con attivazione tramite feature flag per un gruppo pilota.
- Backend autenticato (Supabase Edge Function o Cloudflare Worker): verifica JWT, sessione attiva, ruolo e autorizzazione sul server a ogni richiesta. CORS limitato all'origine LTS. Rate limit, limiti di spesa, log senza PII e gestione timeout.
- Motore IA: chiave API esclusivamente in secret server-side. Minimizzare/redigere dati inviati al modello. Il modello non può invocare direttamente query SQL o API privilegiate.
- Strumenti allowlist: lettura di dati autorizzati per utente, proposte di bozza, richieste di approvazione alla centrale. Validazione schema server-side e controlli di ownership; no scritture automatiche.
- Conferma esplicita: un utente autenticato rivede ogni azione prima del salvataggio. Le tariffe aziendali provengono solo da record verificati.
- Voce: dettatura opzionale solo su gesto utente, nessun ascolto continuo; usare da fermo. Informativa privacy, retention e consenso da valutare prima del rollout.
- Failure mode: se IA o rete sono assenti, il Registro Viaggi resta utilizzabile normalmente.

## Piano rilascio
1. Test automatici engine e accessibilità prototipo.
2. Integrare solo UI protetta con flag OFF per default, senza alterare login, sincronizzazione e service worker finché non validati.
3. Backend read-only con test autenticazione, isolamento tra autisti, MFA admin e rate limit.
4. Bozze viaggio e richieste cliente con conferma; audit.
5. Voce, rollout pilota e monitoraggio errori.
6. Pubblicazione solo dopo revisione e QA: non fare merge automatico di questa PR.
