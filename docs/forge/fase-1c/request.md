# Richiesta

Richiesta del proprietario, alla lettera:

> Integra, poi procedi con 1C e fix a tutti e 6

Run **1C** della fase 1 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. **Difetti rimasti dal run 1B corretti**, tutti: i cinque confermati (tipo di contenuto nella restituzione dei prestiti; 409 di `next-progressive` assente dalla specifica; test dei prestiti che non prova ciò che dice; percorsi di eliminazione non verificati nel client; tipo doppione nel client) e i due plausibili (ricerca con accenti in forma scomposta; `PATCH` di un libro che rivalida campi non inviati).
2. **Lookup ISBN** (design §7.1): metadati da Google Books, Open Library e Anna's Archive, fusi in un'unica risposta, con cache.
3. **Copertine lato server** (design §6.3): scaricate o caricate, salvate nella cartella dati, servite dall'API, con colore dominante.
4. **Import** da Goodreads, Calibre e LibraryThing, con anteprima e deduplica per ISBN; **export** JSON e CSV.
5. **Backup e ripristino** della libreria, copertine incluse; backup programmato con rotazione (design §6.5). Il ripristino richiede di nuovo la password (design §6.4).
6. **Etichette PDF** con DataMatrix, a parità con la 0.3.
7. Il client TypeScript espone tutte le rotte nuove, comprese quelle che trasportano file; il desktop può trasportare dati binari attraverso il comando Tauri.

Fuori da 1C: TLS, mDNS, Docker, workflow di rilascio (run 1D).
