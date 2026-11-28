Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Computer: la libreria locale riceve la sessione

## Il difetto
- Con una libreria locale il computer chiama il core nel processo: `dispatch`, `dispatch_raw` e il download.
- `filter_request_headers(headers, false)` scarta `Authorization`, quindi ogni rotta protetta risponde 401 `unauthorized`.
- Verificato: dopo `POST /api/v1/setup`, `GET /api/v1/books` con il token appena ricevuto risponde 401.

## File
- `apps/desktop/src-tauri/src/dispatch.rs`.
- `apps/desktop/src-tauri/src/download.rs`, se anche il download nel processo scarta l'intestazione.
- `apps/desktop/src-tauri/tests/local_session.rs`, nuovo.

## Regole
- Il core nel processo riceve `Authorization` come un server remoto. Le altre intestazioni restano filtrate come oggi.
- Il test `raw_forwards_only_allowed_headers` cambia di conseguenza: `authorization` ora passa.
- Nient'altro cambia.

## Passi
- [ ] Test in `tests/local_session.rs`, prima del codice, con `bookeeper_core::router(AppState::for_tests())`:
  - `a_local_library_answers_with_the_session`: setup, poi `GET /api/v1/books` con il token, risponde 200;
  - `a_local_library_still_refuses_without_a_session`: senza token, 401;
  - `a_local_download_answers_with_the_session`: un EPUB caricato e attaccato si scarica nel processo con il token, con i byte giusti.
  - `a_local_raw_request_answers_with_the_session`: una richiesta binaria nel processo (`dispatch_raw`), per esempio la copertina di un e-book caricato, con il token risponde 200.
- [ ] Verifica che falliscano, correggi, verifica che passino.

## Nota sulla riprova
- Il primo tentativo è stato fatto con il disco del container pieno. Il codice c'è, ma nessuna revisione l'ha visto girare: verificalo, aggiungi il test sulla richiesta binaria e fai girare tutto.

## Acceptance criteria
- `cargo test -p bookeeper-desktop` e `cargo clippy -p bookeeper-desktop -- -D warnings` passano.
- `cargo fmt --all -- --check` passa.
