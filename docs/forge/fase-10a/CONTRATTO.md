# Contratto del run 10A: e-book nella libreria

Prima di ogni task leggi:
- il design approvato, `docs/superpowers/specs/2026-11-27-ebook-design.md`, parte «Fase 10A»;
- `docs/forge/fase-10a/request.md`;
- i contratti delle app: `docs/forge/fase-2a`, `fase-2b`, `fase-2c`, `fase-3a`, `fase-4b`, `fase-4c`, `fase-5a`, `fase-6b` e `fase-7b`;
- `PRODUCT.md` e `DESIGN.md`.

Qui ci sono i valori fissati e le interfacce che le task si scambiano.

## Valori fissati

- **Cartella:** `<dati>/ebooks/`, con il campo `ebooks_dir` in `Files` (`crates/bookeeper-core/src/state.rs`), creata all'avvio come `covers_dir`.
- **Nome del file su disco:** `<sha256 esadecimale minuscolo>.<ext>`. Il file non cambia mai dopo la scrittura.
- **Formati e tipi:**

  | `format` | Estensione | Tipo MIME |
  |---|---|---|
  | `epub` | `.epub` | `application/epub+zip` |
  | `pdf` | `.pdf` | `application/pdf` |
  | `mobi` | `.mobi` | `application/x-mobipocket-ebook` |
  | `azw3` | `.azw3` | `application/vnd.amazon.ebook` |
  | `fb2` | `.fb2` | `application/x-fictionbook+xml` |
  | `cbz` | `.cbz` | `application/vnd.comicbook+zip` |

  Il formato si riconosce dai primi byte, e solo quando questi non bastano dall'estensione del nome.
- **Limite:** 200 MB per file. La variabile `BOOKEEPER_EBOOK_MAX_MB` lo cambia. Oltre il limite: 413 `payload_too_large`, il codice che il core usa già.
- **Hash per KOReader** (`koreader_hash`): l'MD5 dei campioni di 1024 byte presi agli offset 0, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864, 268435456 e 1073741824. È il `partialMD5` di KOReader. Ci si ferma al primo offset oltre la fine del file; un campione finale più corto di 1024 byte entra nel calcolo.
- **Ruoli:**
  - caricare, attaccare e togliere: `member` o più (`who.require(Role::Member)`);
  - elencare e scaricare: `member` o più;
  - `guest` riceve 403 su tutte le rotte dei file.
- **Codici di errore nuovi:**
  - 415 `unsupported_format`;
  - 422 `drm_protected`;
  - 409 `file_already_attached`;
  - 404 per un libro, un file o uno sha256 sconosciuti.
- **DRM:**
  - un EPUB con `META-INF/rights.xml`, oppure con `META-INF/encryption.xml` che cifra qualcosa di diverso dai soli font, è protetto;
  - un PDF con `/Encrypt` nel trailer è protetto.
  - La cifratura dei font (`http://www.idpf.org/2008/embedding` o `http://ns.adobe.com/pdf/enc#RC`) NON è DRM.
- **Registro attività:** le azioni `book.file.add` e `book.file.remove`, con dettaglio `{format, name}`.
- **Crate Rust:** `rbook` (Apache-2.0) per EPUB e `lopdf` (MIT) per PDF. MAI il crate `epub`, che è GPL-3.0-or-later. Nessun'altra dipendenza nuova senza motivo scritto nel rapporto.

## API (le task `ebook-api` e `ebook-progress` la realizzano; le altre la usano)

- **`PUT /api/v1/ebook-files?name=<nome originale>`**, con il file come corpo grezzo.
  - Il corpo si legge in streaming su un file temporaneo, calcolando insieme sha256 e dimensione: un file grande non sta mai tutto in memoria.
  - Poi riconosce il formato, controlla il DRM e sposta il file al suo nome definitivo. Se esiste già non lo duplica.
  - Risponde 200 con `EbookFileInfo { sha256, format, size_bytes, name, metadata: EbookMetadata, has_cover }`, dove `EbookMetadata { title?, authors: string[], language?, publisher?, published_year?, isbn_13?, description? }`.
  - Un file caricato e mai attaccato a un libro si cancella dopo 24 ore.
- **`GET /api/v1/ebook-files/{sha256}/cover`**: la copertina estratta, passata per `covers::process`, come JPEG. 404 se non c'è.
- **`POST /api/v1/books/{id}/files`**, con `{ sha256, name }`.
  - Risponde 201 con `BookFileOut { id, book_id, format, size_bytes, name, created_at, uploaded_by: { id, display_name } | null, missing: boolean }`.
  - Se il libro non ha una copertina e il file sì, la copertina passa al libro con la logica esistente di `api/covers.rs`.
- **`GET /api/v1/books/{id}/files`**: `BookFileOut[]`. `missing` è vero quando il file non c'è sul disco.
- **`GET /api/v1/books/{id}/files/{file_id}/content`**: il file.
  - Supporta `Range`: 206 con `Content-Range`, oppure 416.
  - `Content-Type` è quello del formato.
  - `Content-Disposition: attachment` con il nome «Autore - Titolo.ext»: forma `filename*` UTF-8, più un `filename` ASCII di riserva.
- **`DELETE /api/v1/books/{id}/files/{file_id}`**: 204. Il file su disco si cancella solo se nessun'altra riga di `book_files` usa lo stesso sha256. Anche cancellare un libro cancella i suoi file non più usati.
- **`BookOut`** riceve `file_formats: string[]`: i formati dei file attaccati, senza ripetizioni, in ordine alfabetico.
- **Progresso** (task `ebook-progress`):
  - `ReadingOut` riceve `progress_percent: number | null` e `progress_at: number | null`.
  - `PUT /api/v1/books/{id}/files/{file_id}/position`, con `{ kind: "cfi", value, percent }` e `percent` fra 0 e 100. Risponde con `ReadingOut`.
  - `GET /api/v1/books/{id}/positions` restituisce le posizioni della persona per i file del libro: `[{ file_id, kind, value, percent, device_id, device_name, updated_at }]`.
- **Dopo ogni modifica dell'API:**

  ```
  UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored && npm run gen -w @bookeeper/api && npm test -w @bookeeper/api
  ```

  `packages/api` resta allineato.

## Regole

- **Core:**
  - le rotte nuove stanno in moduli nuovi di `crates/bookeeper-core/src/api/`, con `routes()` e un `Doc` per OpenAPI, come `covers.rs`;
  - la logica dei file sta in `crates/bookeeper-core/src/ebooks.rs`;
  - i test d'integrazione stanno in `crates/bookeeper-core/tests/`, come quelli esistenti.
- **Interfaccia:** Impeccable in modalità **Operate** (`.claude/skills/impeccable/`):
  - setup con `impeccable context --target <file>`;
  - `reference/craft-floor.md` prima di ogni modifica;
  - `impeccable detect --json` pulito alla fine.

  Il salvataggio remoto dei rapporti NON si usa. Non proporre alternative di design: decidi secondo questa consegna e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- **Regole di sempre:**
  - nessun componente oltre 250 righe;
  - nessun testo nei componenti (tutto in `packages/i18n`, italiano e inglese);
  - nessuna chiamata al client dentro un componente;
  - nessun colore letterale;
  - WCAG 2.2 AA;
  - ogni comportamento ha un test.
- **Ambito:** ogni task tocca solo i file dichiarati.
- **Rischi:** nessuna modifica a `ops/`, ai workflow o al servizio degli aggiornamenti.

## Cose che più facilmente farebbero male, e dove sono provate

1. **Un file grande** (fino a 200 MB) che manda il core fuori memoria o blocca l'interfaccia. Lo provano:
   - `ebook-api`, con un caricamento da 50 MB generato nel test: la memoria non cresce con il file, e oltre il limite risponde 413 senza lasciare file temporanei;
   - `ebook-ui-files`, con un download in streaming.
2. **Lo stesso file su due libri, poi tolto da uno.** Il file su disco deve restare. Lo prova `ebook-api`.
3. **Un EPUB con i soli font cifrati.** Non è DRM e va accettato. Lo prova `ebook-core`.
4. **Un download interrotto e ripreso** con `Range`. Lo prova `ebook-api`: 206 con byte giusti, 416 oltre la fine.
5. **Un ripristino da backup senza la cartella `ebooks/`.** I file risultano `missing`, e niente si rompe. Lo prova `ebook-backup`.
