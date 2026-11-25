Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Setup: creare una libreria

## Obiettivo

Le rotte `GET /api/v1/setup` e `POST /api/v1/setup` in `crates/bookeeper-core/src/api/setup.rs`, più le funzioni che il server userà per il codice di setup.

## Rotte

`GET /setup` → `{ "needs_setup": bool, "code_required": bool }`. `needs_setup` è vero se non esiste alcuna libreria. `code_required` è vero con `SetupPolicy::CodeRequired`.

`POST /setup` con il corpo del contratto → 201 `AuthOut`. In **una sola transazione**: crea la libreria, l'utente con ruolo `owner`, il dispositivo (`sessions::create_device`).

| Politica | Regole |
| --- | --- |
| `Open` (app desktop) | Ammesso solo se non esiste alcuna libreria, altrimenti 409 `setup_closed`. `email` e `password` sono facoltative. `setup_code` è ignorato. |
| `CodeRequired` (server) | `setup_code` deve corrispondere all'hash salvato in `server_meta` alla chiave `setup_code_hash`, altrimenti 403 `setup_code_invalid` (anche se manca, o se nessun codice è stato generato). `email` e `password` sono obbligatorie (422 `validation`). Si possono creare più librerie. Il codice è monouso: la riga viene cancellata nella stessa transazione. |

La password, se presente, è salvata con `password::hash`. L'email è normalizzata. Validazione dei campi come da contratto, prima di toccare il database. L'hashing Argon2 è lento: fallo dentro `db.run`, non sul thread delle richieste.

## Funzioni pubbliche per il server

```rust
/// Genera un nuovo codice di setup, ne salva l'hash sostituendo il precedente e restituisce il codice in chiaro ("XXXX-XXXX-XXXX").
pub fn new_setup_code(conn: &mut rusqlite::Connection) -> rusqlite::Result<String>;
pub fn library_count(conn: &mut rusqlite::Connection) -> rusqlite::Result<i64>;
```

## OpenAPI

Annota le due rotte e registra in `Doc` gli schemi di richiesta e risposta (`SetupStatus`, `SetupRequest`, `AuthOut`, `LibraryOut`, `UserOut`, `Session`). Definisci `AuthOut`, `LibraryOut`, `UserOut` qui come `pub`: le task `login` e `pairing` li riuseranno da `crate::api::setup`.

## Test (`crates/bookeeper-core/tests/setup_api.rs`)

Usa `mod common;` (`common::call`). Per `CodeRequired` costruisci lo stato con `AppState::open(Db::open_in_memory()?, SetupPolicy::CodeRequired)`.

- `status_on_empty_database`: `needs_setup: true`, `code_required: false`.
- `open_setup_without_password`: 201; `user.role == "owner"`, `user.email == null`; il token di accesso funziona su una rotta protetta (usa un router di prova con `AuthUser`, oppure `verify_access`).
- `open_setup_is_closed_after_the_first_library`: il secondo `POST` → 409 `setup_closed`; `GET` dice `needs_setup: false`.
- `code_required_rejects_missing_and_wrong_codes`: senza codice e con codice errato → 403 `setup_code_invalid`, e nessuna libreria creata.
- `code_required_accepts_the_code_in_any_case_and_spacing`: il codice in minuscolo e senza trattini funziona.
- `setup_code_is_single_use`: lo stesso codice una seconda volta → 403.
- `code_required_needs_email_and_password`: senza → 422 `validation`.
- `several_libraries_on_a_server`: due codici, due librerie con la stessa email: entrambe 201.
- `validation_table`: nome di libreria vuoto, di soli spazi, di 81 caratteri; email senza `@`; password di 7 caratteri; `device_kind: "tv"` → 422 `validation`, nulla creato.
- `email_is_normalised`: `" Ada@Example.COM "` è salvata come `ada@example.com`.
- `failed_setup_creates_nothing`: dopo un 422 le tabelle `libraries`, `users`, `devices` sono vuote.

## Acceptance criteria

- `cargo test -p bookeeper-core --test setup_api` passa con gli undici test.
- Solo `api/setup.rs` e `tests/setup_api.rs` sono cambiati.
- Le due rotte compaiono in `bookeeper_core::openapi()` sotto `/api/v1/setup`.
- La password e il codice di setup non compaiono in nessun log.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
