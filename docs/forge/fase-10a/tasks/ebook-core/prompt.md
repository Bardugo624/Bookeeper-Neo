Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`.

# Core: archivio dei file, metadati e controllo DRM

## File
- Crea `crates/bookeeper-core/src/db/migrations/0005_ebooks.sql` e registrala nella lista di `crates/bookeeper-core/src/db/`.
- Crea `crates/bookeeper-core/src/ebooks.rs`, dichiaralo in `lib.rs` e aggiungi `ebooks_dir` in `state.rs`.
- Aggiungi `rbook` e `lopdf` in `crates/bookeeper-core/Cargo.toml` e `Cargo.lock`.
- Scrivi i test in `crates/bookeeper-core/tests/ebooks.rs`, con fixture generate nel test: un EPUB minimo (`mimetype`, `META-INF/container.xml`, OPF con titolo, autori, lingua, ISBN e copertina) e un PDF minimo con `/Info`.
- Estendi il test delle migrazioni in `crates/bookeeper-core/tests/db.rs`.

## Migrazione 0005
- La tabella `book_files`, con le colonne:
  - `id`, `library_id` e `book_id` (`ON DELETE CASCADE`);
  - `format`, con un CHECK sui sei formati del contratto;
  - `sha256`, `size_bytes`, `original_name`, `koreader_hash`;
  - `uploaded_by` (`ON DELETE SET NULL`) e `created_at`;
  - `UNIQUE(book_id, sha256)`.

  Ha gli indici su `book_id`, `sha256` e `koreader_hash`.
- In `reading`, le colonne `progress_percent REAL` (CHECK fra 0 e 100, oppure NULL), `progress_at INTEGER` e `progress_device_id TEXT`.
- La tabella `reading_positions`, con le colonne:
  - `id`, `library_id`, `user_id` e `file_id` (verso `book_files`, `ON DELETE CASCADE`);
  - `kind`, con un CHECK su `'cfi'`, `'koreader'` e `'kobo'`;
  - `value`, `percent`, `device_id` e `updated_at`;
  - `UNIQUE(user_id, file_id, kind)`.

## Interfacce prodotte (`ebooks.rs`)
- `pub enum EbookFormat { Epub, Pdf, Mobi, Azw3, Fb2, Cbz }`, con `as_str()`, `ext()`, `mime()` e `detect(head: &[u8], name: &str) -> Option<EbookFormat>`.
- `pub struct Stored { pub sha256: String, pub size_bytes: u64, pub format: EbookFormat, pub koreader_hash: String }`.
- `pub async fn store_stream(dir: &Path, name: &str, body: axum::body::Body, max_bytes: u64) -> Result<Stored, StoreError>`. Scrive su un file temporaneo nella stessa cartella e calcola lo sha256 mentre legge. Poi riconosce il formato, controlla il DRM e calcola `koreader_hash`. Infine rinomina al nome definitivo, oppure scarta il temporaneo se il file esiste già. A qualunque errore il temporaneo sparisce.
- `pub enum StoreError { TooLarge, Unsupported, Drm, Io(std::io::Error) }`.
- `pub fn ebook_path(dir: &Path, sha256: &str, format: EbookFormat) -> Option<PathBuf>`: `None` se lo sha256 non sono 64 cifre esadecimali.
- `pub fn partial_md5(path: &Path) -> std::io::Result<String>`, secondo il contratto.
- `pub fn read_metadata(path: &Path, format: EbookFormat) -> EbookMetadataRaw`: i campi di `EbookMetadata` del contratto. Per EPUB usa `rbook`; per PDF il dizionario `/Info` con `lopdf`. Per gli altri formati è vuoto. Non fallisce mai: un file illeggibile dà metadati vuoti.
- `pub fn extract_cover(path: &Path, format: EbookFormat) -> Option<Vec<u8>>`: la copertina degli EPUB, `None` per gli altri formati.
- `pub fn sweep_staged(dir: &Path, referenced: &std::collections::HashSet<String>, older_than: std::time::Duration) -> std::io::Result<usize>`: cancella i file non referenziati più vecchi di `older_than` e i temporanei orfani.

## Passi
- [ ] Test, prima del codice:
  - `detect` su EPUB, PDF, MOBI (`BOOKMOBI` all'offset 60), FB2, CBZ e un file di testo, che restituisce `None`;
  - `partial_md5` su un file da 3 KB e su uno da 2 MB, confrontati con un calcolo indipendente nel test con gli stessi offset;
  - `store_stream`: sha256 giusto, file al suo nome, un secondo caricamento identico che non duplica, `TooLarge` oltre il limite senza temporanei rimasti;
  - DRM: EPUB con `rights.xml` → `Drm`; EPUB con `encryption.xml` dei soli font → accettato; PDF con `/Encrypt` → `Drm`;
  - `read_metadata` e `extract_cover` sull'EPUB di prova, e i metadati del PDF;
  - `sweep_staged`.
- [ ] Verifica che falliscano, scrivi il codice e verifica che passino. Poi verifica che la migrazione si applichi a un database 0004 esistente: c'è già un test delle migrazioni da estendere.

## Acceptance criteria
- `cargo test -p bookeeper-core` passa; `cargo clippy -p bookeeper-core -- -D warnings` passa.
- Nessuna rotta nuova: le rotte sono della task `ebook-api`.
