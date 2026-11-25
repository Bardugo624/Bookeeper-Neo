Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test.

# Guscio: salvataggio di file con finestra di sistema

## Obiettivo

Export, backup ed etichette producono file. Nella webview di Tauri uno scaricamento da URL oggetto non è affidabile su tutti i sistemi. Aggiungi `saveFile` alla piattaforma secondo il contratto. Leggi `apps/desktop/src/platform/` e `apps/desktop/src-tauri/src/lib.rs`.

## Cosa fare

1. **Rust, `files.rs`**: comando `save_file`. Apre la finestra "Salva con nome" del sistema con nome proposto e filtri; se l'utente sceglie un percorso, decodifica i byte e scrive il file (file temporaneo nella stessa cartella e rinomina; se la rinomina non è possibile, scrittura diretta). Restituisce `{ saved, path }`. Annullamento: `saved: false`. Dipendenza: `tauri-plugin-dialog` (registrata nel costruttore, con il solo permesso di salvataggio in `capabilities/default.json`). Verifica con `cargo tree` che non entrino `aws-lc-rs`, `aws-lc-sys`, `openssl-sys`. Il nome proposto è ripulito: niente separatori di percorso, niente caratteri di controllo, lunghezza massima 120.
   La parte che non dipende dalla finestra (pulizia del nome, decodifica, scrittura atomica) sta in funzioni pure provabili senza Tauri.
2. **CI**: se il plugin richiede librerie di sistema in più su Linux, aggiungile al passo `apt-get install` del job `rust` in `.github/workflows/ci.yml` (unica modifica ammessa a quel file) e dichiaralo nel rapporto.
3. **TypeScript**: `saveFile` in `Platform`, in `tauriPlatform` (comando), in `browserPlatform` (URL oggetto, ancora con `download`, revoca dell'URL) e nella piattaforma finta dei test (registra le chiamate; risultato configurabile).

## Test

- Rust (`tests/files.rs`): pulizia del nome (separatori, `..`, caratteri di controllo, nome vuoto → `file`, troncamento che conserva l'estensione); scrittura atomica su cartella temporanea; base64 non valido → errore senza file creato; file esistente sostituito.
- TypeScript: `tauriPlatform().saveFile` chiama il comando con nome, base64 e filtri; `browserPlatform` crea e revoca l'URL oggetto e restituisce `saved: true`; la piattaforma finta registra le chiamate.

## Acceptance criteria

- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings`, `cargo build -p bookeeper-desktop` passano.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys`, `cargo tree -i openssl-sys` non trovano nulla.
- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/files.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/tests/files.rs`, file sotto `apps/desktop/src/platform/`, `.github/workflows/ci.yml`.
