Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. La task `ebook-core` è già unita.

# Core: le rotte dei file

## File
- Crea `crates/bookeeper-core/src/api/ebook_files.rs` (`PUT /api/v1/ebook-files` e la copertina) e `crates/bookeeper-core/src/api/book_files.rs` (attaccare, elencare, scaricare, togliere).
- Registra le rotte in `api/mod.rs` e in `openapi.rs`.
- Modifica `api/books.rs`: `file_formats` in `BookOut`, e la pulizia dei file quando un libro si cancella.
- Aggiorna `packages/api` (OpenAPI e client generato).
- Scrivi i test in `crates/bookeeper-core/tests/ebook_api.rs`.

## Cosa fare
- Le rotte e le risposte del contratto, alla lettera. I file si leggono in streaming con `ebooks::store_stream`, MAI con `read_body`.
- Il download risponde alle richieste a intervalli (`Range`). Se `tower-http` `ServeFile` regge `Range` e i nostri header, usalo; altrimenti scrivi la risposta a mano. Un test lo prova in tutti e due i casi.
- La pulizia dei file caricati e mai attaccati gira all'avvio e dopo ogni caricamento, al massimo una volta ogni ora.
- Il registro scrive `book.file.add` e `book.file.remove`.

## Passi
- [ ] Test, prima del codice:
  - caricamento EPUB, risposta `EbookFileInfo` con i metadati;
  - 415 per un file di testo, 422 per un EPUB con `rights.xml`, 413 oltre il limite;
  - un caricamento da 50 MB, generato nel test, che non porta il processo oltre una soglia di memoria ragionevole: misura RSS prima e dopo, se la piattaforma lo permette, altrimenti spiega nel rapporto;
  - attaccare → 201 e `BookOut.file_formats == ["epub"]`; attaccare di nuovo → 409;
  - la copertina passa al libro che non ne ha;
  - elenco; `missing` vero dopo aver cancellato il file dal disco a mano;
  - download completo con il `Content-Disposition` giusto; `Range: bytes=0-99` → 206 con 100 byte; un range oltre la fine → 416;
  - lo stesso file su due libri: togliendolo da uno resta su disco, togliendolo anche dall'altro sparisce;
  - cancellare un libro cancella i suoi file non più usati;
  - `guest` → 403 su tutte le rotte dei file;
  - una voce di registro per ogni aggiunta e rimozione.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino e aggiorna OpenAPI e `packages/api` con il comando del contratto.

## Acceptance criteria
- `cargo test -p bookeeper-core`, `cargo clippy -p bookeeper-core -- -D warnings` e `npm test -w @bookeeper/api` passano.
- `npm run typecheck` passa alla radice.
