Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. La task `p3-rust` è già unita.

# Guscio: token nel portachiavi di sistema

Segui la sezione "Portachiavi" del contratto. Leggi `apps/desktop/src-tauri/src/connections.rs`, `lib.rs` e i test esistenti.

## Cosa fare

1. **`secrets.rs`**: tratto `SecretStore`, implementazione `MemoryStore` (test), implementazione di sistema con il crate `keyring` (Windows Credential Manager, portachiavi di macOS, Secret Service su Linux). Scegli le funzioni del crate in modo che non entrino `openssl-sys` né `aws-lc`, e che `cargo build -p bookeeper-desktop` passi in questo ambiente. Se su Linux serve una libreria di sistema (per esempio `libdbus`): preferisci una funzione `vendored` del crate; se non basta, aggiungi il pacchetto al passo `apt-get install` del job `rust` in `.github/workflows/ci.yml` (unica modifica ammessa a quel file) e dichiaralo.
2. **Disponibilità**: all'avvio una prova di scrittura, lettura e cancellazione di una voce di controllo decide tra `keychain` e `file`. Il risultato vale per tutta la sessione.
3. **`connections.rs`**: lo `Store` riceve un `Arc<dyn SecretStore>` e la modalità. In modalità `keychain`: i token non si scrivono nel file; `load` li legge dal portachiavi; `upsert` li scrive (un token `None` cancella la voce); `remove` cancella le voci. Migrazione e ripiego come da contratto. Un errore del portachiavi in lettura per una connessione: quella connessione risulta senza token (porta a "Bentornato"), le altre non ne risentono, e si scrive un `warn` senza segreti.
4. `connections_get` aggiunge `secrets`.

## Test

Con `MemoryStore` e con uno store finto che fallisce a comando:

- `tokens_never_reach_the_file_in_keychain_mode`: il contenuto di `connections.json` non contiene i token.
- `load_fills_tokens_from_the_store`.
- `migration_moves_tokens_and_rewrites_the_file`; `migration_keeps_the_file_when_the_store_refuses`.
- `a_none_token_deletes_the_entry`; `remove_deletes_both_entries`.
- `a_read_failure_leaves_that_connection_without_tokens`.
- `file_mode_behaves_as_before`: i test esistenti restano verdi in modalità `file`.
- `the_probe_picks_file_when_the_store_is_unavailable`.
- `secrets_is_reported`.
- Un test `#[ignore]` che usa il portachiavi vero.

## Acceptance criteria

- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings`, `cargo build -p bookeeper-desktop` passano.
- `cargo tree -i aws-lc-rs`, `-i aws-lc-sys`, `-i openssl-sys` non trovano nulla.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `connections.rs`, `secrets.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, file sotto `apps/desktop/src-tauri/tests/`, `.github/workflows/ci.yml`.
