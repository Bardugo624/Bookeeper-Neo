Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita. Ogni correzione ha un test che fallisce prima e passa dopo.

# Guscio: cinque difetti P3 del run 2D

1. **`src/files.rs:48`** — la pulizia del nome non è sempre idempotente: il controllo "solo trattini bassi → `file`" avviene prima del troncamento, che può togliere l'unico carattere diverso. Regola: `sanitize(sanitize(x)) == sanitize(x)` per ogni ingresso; applica i passi fino a punto fisso o riordinali, e provalo con un test a proprietà su ingressi generati in modo deterministico (almeno 2.000, compresi nomi lunghi fatti di `_`, punti e spazi).
2. **`src/connections.rs:207`** — in modalità `file` le cancellazioni di pulizia dal portachiavi falliscono in silenzio (`let _ =` in `upsert`, solo un `warn` in `remove`). Se l'app è ripiegata su `file` per un guasto momentaneo, nel portachiavi restano token vecchi che al riavvio successivo in modalità `keychain` tornano validi. Regola: le voci non cancellate si ricordano in `connections.json` (elenco `stale_secrets` di chiavi, mai valori) e si ritenta la cancellazione a ogni avvio in modalità `keychain`, prima di leggere i token; una chiave in quell'elenco non viene mai letta.
3. **`src/sharing.rs:222`** — ogni errore di apertura della porta diventa `port_in_use`, anche un permesso negato. Regola: `AddrInUse` → `port_in_use`; `PermissionDenied` → `port_not_allowed`; il resto → `bind_failed`. Aggiorna il commento del tipo `SharingStatus`.
4. **`src/sharing.rs:145`** — cambiando porta, se la nuova non si apre il vecchio server è già stato fermato e lo stato riporta la porta vecchia. Regola: si apre prima la porta nuova; solo se riesce si ferma il vecchio server. Se fallisce, la condivisione resta attiva sulla porta vecchia e lo stato riporta l'errore con il campo nuovo `attempted_port`.
5. **`src/sharing.rs:171`** — `status_of` fa lavoro bloccante (elenco delle interfacce, lettura del certificato) sul runtime asincrono tenendo il blocco. Regola: impronta e frase si calcolano una volta all'avvio della condivisione e si tengono in memoria; l'elenco degli indirizzi si legge in `spawn_blocking`, fuori dal blocco.

## Test

In `apps/desktop/src-tauri/tests/`: idempotenza della pulizia; `stale_secrets` scritto al fallimento, ritentato e svuotato all'avvio, mai letto; tre codici d'errore di apertura (per `PermissionDenied` usa una funzione pura che mappa `io::ErrorKind`); cambio di porta fallito → la porta vecchia risponde ancora e `attempted_port` è quella nuova; cambio riuscito → la vecchia è chiusa.

## Acceptance criteria

- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings`, `cargo fmt --check` passano.
- Cambiano solo: `apps/desktop/src-tauri/src/files.rs`, `connections.rs`, `sharing.rs`, file sotto `apps/desktop/src-tauri/tests/`.
