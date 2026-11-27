Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. La task `ebook-core` è già unita.

# Backup: elenco dei file, senza i file

## File
- Modifica `crates/bookeeper-core/src/backup.rs` e i suoi test.

## Cosa fare
- `data.json` contiene le righe di `book_files` e di `reading_positions`, come le altre tabelle. L'archivio NON contiene i file degli e-book.
- `manifest.json` riceve `ebooks: { count, total_bytes }`.
- Il ripristino rimette le righe anche quando il file manca sul disco: l'elenco lo mostrerà come `missing`.
- Un archivio vecchio, senza queste tabelle, si ripristina come prima.

## Passi
- [ ] Test, prima del codice:
  - un backup con un libro e un file attaccato: le righe ci sono, nessuna voce `ebooks/` nell'archivio, il manifest ha il conteggio;
  - il ripristino rimette le righe; con il file presente su disco il file è leggibile, senza la cartella resta solo la riga;
  - un archivio senza le tabelle nuove si ripristina.
- [ ] Verifica che falliscano, scrivi il codice e verifica che passino.

## Acceptance criteria
- `cargo test -p bookeeper-core` passa; `cargo clippy -p bookeeper-core -- -D warnings` passa.
- Cambia solo `backup.rs` con i suoi test.
