Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# Guscio: connessioni salvate e finestra senza cornice

## Obiettivo

Dare all'app desktop la memoria delle connessioni (design §6.7: "token, impostazioni e dati locali salvati sotto un identificativo di connessione") e la finestra senza cornice di sistema del mockup.

Leggi `apps/desktop/src-tauri/src/lib.rs` e `dispatch.rs` prima di scrivere.

## Cosa fare

1. **`connections.rs`**: tipi e file del contratto. Un tipo `Store` che possiede il percorso e un `Mutex`: `load`, `upsert`, `activate`, `remove`. Scrittura atomica (file temporaneo nella stessa cartella, poi rinomina); permessi `0600` su Unix. File assente o vuoto: `Connections` vuoto. File illeggibile come JSON: viene rinominato in `connections.json.corrotto-<unix>` e si riparte da vuoto, con un `warn` nel log che non contiene il contenuto.
   Regole: `id` DEVE essere un UUID; `kind: remote` richiede `url` che inizia con `http://` o `https://`, salvato senza barra finale; `kind: local` non ha `url` né `fingerprint`; `fingerprint`, se presente, è di 64 cifre esadecimali, salvato in minuscolo; al più una connessione `local` (un secondo `upsert` locale con id diverso è un errore). Errori come `String` in inglese, senza token.
2. **Comandi** del contratto in `lib.rs`, con lo `Store` nello stato gestito da Tauri. Registrali in `invoke_handler` accanto a quelli esistenti.
3. **`window.rs`** (o direttamente la configurazione): `decorations: false` in `tauri.conf.json`; `capabilities/default.json` concede alla finestra principale solo i permessi `core:window` per riduci, ingrandisci/ripristina, chiudi, trascina e lettura dello stato di ingrandimento, più ciò che serve ai comandi propri. Nessun permesso più largo (`core:default` va bene se già presente; niente `shell`, `fs`, `http`).
4. Dipendenze: `uuid` (v7) e ciò che serve alla scrittura atomica, solo se non già disponibili dal workspace. `Debug` di `Connection` NON DEVE stampare i token: scrivilo a mano.

## Test

In `apps/desktop/src-tauri/tests/connections.rs`, su cartelle temporanee:

- `an_empty_folder_gives_no_connections`.
- `upsert_then_load_round_trips`.
- `upsert_replaces_by_id`.
- `activate_needs_an_existing_id`.
- `removing_the_active_connection_clears_active`.
- `a_second_local_connection_is_refused`.
- `remote_needs_an_http_url` e `the_trailing_slash_is_dropped`.
- `a_bad_fingerprint_is_refused` e `the_fingerprint_is_stored_lowercase`.
- `a_corrupt_file_is_set_aside`: dopo il caricamento esiste un file `.corrotto-*` e le connessioni sono vuote.
- `the_file_is_private` (solo Unix): permessi `0600`.
- `debug_never_prints_tokens`.
- `tauri_conf_has_no_decorations`: legge `tauri.conf.json` e controlla `decorations == false`.

## Acceptance criteria

- `cargo test -p bookeeper-desktop` passa.
- `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passa.
- `cargo build -p bookeeper-desktop` passa.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys`, `cargo tree -i openssl-sys` non trovano nulla.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/connections.rs`, `apps/desktop/src-tauri/src/window.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/capabilities/default.json`, file sotto `apps/desktop/src-tauri/tests/`.
