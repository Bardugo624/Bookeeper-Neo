Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. Le task del core sono già unite: usa `packages/api`.

# Computer: i file nella scheda del libro, il download e l'anello

## File
- `apps/desktop/src/modules/books/`: la scheda del libro e i componenti nuovi del blocco «File».
- `apps/desktop/src/modules/reading/`: l'anello.
- `apps/desktop/src/platform/` e `apps/desktop/src-tauri/src/`: il download in streaming.
- `packages/i18n/src/locales/{it,en}/books.json` e `reading.json`.

## Cosa fare
1. **Blocco «File» nella scheda del libro** (`BookDetailPage`), per chi può leggere i file (non `guest`). Ogni file mostra:
   - formato e dimensione leggibile;
   - il nome;
   - «Scarica»;
   - per chi può modificare, «Togli il file»: conferma con `tone="danger"` e la conseguenza («Il file sarà tolto dal libro. Se nessun altro libro lo usa, sparisce anche dal disco.»);
   - «File mancante», se `missing`.

   Il blocco ha anche «Aggiungi il file»: un selettore che accetta i sei formati, più il trascinamento di un file sul blocco. Carica con `PUT /api/v1/ebook-files`, poi attacca. Durante il caricamento c'è un indicatore, e gli errori 413, 415 e 422 hanno messaggi chiari. Il 422 dice che il file è protetto da DRM e che Bookeeper apre solo file senza protezione.
2. **Download senza tenere il file in memoria.** Oggi `save_file` passa i byte in base64 e non regge 200 MB. Aggiungi:
   - `platform.downloadToFile({ url, suggestedName })`;
   - in Tauri, un comando Rust che chiede dove salvare e poi scrive la risposta HTTP in streaming, con l'intestazione di autenticazione della sessione;
   - nel browser, `fetch` più un blob.

   Il nome proposto è quello di `Content-Disposition`.
3. **L'anello** (`ReadingCard`, `BookCard` e la scheda) mostra `progress_percent` quando c'è, altrimenti il calcolo di oggi sulla pagina.
   Un aggiornamento ottimista della lettura conserva `progress_percent` e `progress_at` della lettura in cache, così l'anello non si azzera.
4. **Le card** dei libri con file mostrano una piccola etichetta dei formati (`file_formats`), per esempio «EPUB».

## Test
- Blocco: elenco, scarica, togli con la conferma, aggiungi, i tre errori, «File mancante», niente blocco per `guest`.
- Il comando Tauri ha test Rust sul percorso di scrittura in streaming, con un server locale nel test.
- Anello: con `progress_percent` e senza.
- Etichetta dei formati sulla card.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/desktop` passa.
- `npx vitest run src/modules/books src/modules/reading src/platform src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa.
- `cargo test -p bookeeper-desktop` passa.
- `impeccable detect --json` pulito sui file cambiati.
- `cargo fmt --all -- --check` passa.
