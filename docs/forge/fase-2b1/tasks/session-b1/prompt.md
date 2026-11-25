Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e i contratti della fase 1 che riguardano i file che tocchi. Ogni correzione ha un test che fallisce prima e passa dopo.

# Guscio: file corrotto messo da parte senza perdite

File: `apps/desktop/src-tauri/src/connections.rs` (righe 160-170 circa). La correzione precedente usa `hard_link` seguito da `remove_file`. Due difetti:

1. Due processi trovano lo stesso file corrotto: A lo mette da parte e scrive un file nuovo valido; B, il cui collegamento puntava al vecchio file, esegue `remove_file` e cancella il file nuovo di A.
2. Su un filesystem senza collegamenti fisici (FAT, exFAT, alcune condivisioni di rete) `hard_link` fallisce e `load()` restituisce un errore, dove prima funzionava.

Regola: la copia messa da parte si crea con `OpenOptions::new().write(true).create_new(true)` scrivendo i byte già letti del file corrotto (nome successivo se esiste). L'originale si rimuove solo se il suo contenuto è ancora identico a quei byte al momento della rimozione; se è cambiato (un altro processo l'ha già sostituito) non si tocca e si ricarica. Nessun uso di `hard_link`.

## Test

In `apps/desktop/src-tauri/tests/connections.rs`:

- `a_replaced_file_is_not_deleted`: tra la lettura del file corrotto e la rimozione il file viene sostituito con uno valido (rendi il passo intermedio provabile con una funzione interna che riceve i byte letti): il file valido resta e viene caricato.
- `setting_aside_never_uses_hard_links`: il sorgente non contiene `hard_link`.
- I test esistenti sul file corrotto restano verdi.

## Acceptance criteria

- `cargo test -p bookeeper-desktop --test connections` e `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- Cambiano solo: `apps/desktop/src-tauri/src/connections.rs`, `apps/desktop/src-tauri/tests/connections.rs`.
