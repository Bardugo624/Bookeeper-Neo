# Richiesta

Richiesta del proprietario, alla lettera:

> Come sempre, prima integra, poi tutti i P3 poi prossima fase

> Serve anche un mobile.neokeeper.dev e un app.neokeeper.dev

Run **1E**, di correzione, tra la fase 1 e la fase 2 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. **Difetti P3 rimasti dal run 1D corretti**, tutti e quattordici: backup datato nel futuro entro la tolleranza; larghezze di `ì í î ï ø` nelle etichette; `--public-url` accettato con host vuoto o con spazi; `url` mDNS troncato; due righe di log per una risposta 5xx; riga "in ascolto" stampata prima di caricare il certificato; messaggio di `fingerprint` che parla di configurazione non valida; handshake senza limite di tempo in `acme`; nome mDNS stampato diverso da quello pubblicato; ciclo attivo in un test; 422 mancante su `POST /auth/refresh`; 413 non documentato sulle rotte JSON; esenzione di `GET /setup` non dichiarata; `public_url` opzionale nello schema.
2. **Più domini**: `--domain` accetta più nomi; in `acme` un solo certificato li copre tutti.
3. **Difetti trovati provando l'immagine Docker**: la build scarica una seconda toolchain Rust per via di `rust-toolchain.toml`; i log contengono sequenze di colore anche quando l'uscita non è un terminale; l'immagine non dichiara la porta 443 e il file compose non mostra l'uso con un dominio.

## Limiti noti di questo ambiente

- L'emissione reale di un certificato ACME non è verificabile qui.
- La build Docker dentro un worktree richiede impostazioni di proxy: la verifica dell'immagine la fa chi lancia il run, non la task.
