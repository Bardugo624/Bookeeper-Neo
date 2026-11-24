# Richiesta

Richiesta del proprietario, alla lettera:

> Integra, procedi con forge, hai la 0.22 da installare ora che integra i changes. E fai una task per sistemare anche le P3

Run **1B** della fase 1 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. **Difetti P3 del run 1A corretti**: limite di tentativi che regge alle raffiche simultanee; password troppo corta al login → 422; corpo JSON oltre il limite → 413; cambio password senza email sempre rifiutato; transazione di setup che si annulla da sola; pulizia in `pairing`.
2. **Risorse a parità con la 0.3** (design §7.1): libri (creazione, lettura, modifica, eliminazione singola e multipla, numero progressivo, ricerca full-text con filtri), scaffali (configurazione, collocazione, assegnazione multipla, riempimento), prestiti (crea, modifica, restituisci, riapri), wishlist (con conversione in libro), statistiche.
3. Ogni rotta rispetta l'isolamento tra librerie e i ruoli: `guest` legge soltanto.
4. Ogni modifica lascia una riga in `audit_log`, nella stessa transazione.
5. Il client TypeScript in `packages/api` espone tutte le rotte nuove.

Fuori da 1B: stato di lettura, tag, stanze, proprietario del libro (fasi 4–6); lookup ISBN, copertine, import/export, backup, etichette (run 1C).
