Leggi prima `docs/forge/fase-6a/CONTRATTO.md` (sezioni Regole, Ruoli, Persone, Inviti) e `docs/forge/fase-4a/CONTRATTO.md`. Leggi `crates/bookeeper-core/src/auth` per intero, `crates/bookeeper-core/src/api/pairing.rs`, `devices.rs`, `setup.rs`, `audit.rs`, `crates/bookeeper-core/src/db/mod.rs`, e i test `tests/pairing_api.rs`, `tests/devices_api.rs`, `tests/common`.

# Core: persone, inviti, cambio proprietario

## Cosa fare

1. **Migrazione** `crates/bookeeper-core/src/db/migrations/0003_invites.sql`, registrata in `db/mod.rs` dopo la `0002`, come da contratto. I codici di dispositivo creati da `POST /pairing/codes` ricevono anch'essi un `id`.
2. **Persone**: file nuovo `crates/bookeeper-core/src/api/users.rs` con le quattro rotte del contratto. Le regole di "Chi gestisce chi" stanno in una sola funzione pura, provata da test unitari su tutte le coppie di ruoli.
3. **Inviti**: file nuovo `crates/bookeeper-core/src/api/invites.rs` con le tre rotte. La generazione del codice è quella dei dispositivi: riusala, non duplicarla.
4. **Abbinamento** (`pairing.rs`): `POST /pairing/inspect` e il riscatto degli inviti, come da contratto. Il riscatto di un codice di dispositivo NON cambia. `inspect` usa lo stesso limite di tentativi di `redeem`.
5. **Audit** delle azioni nuove nella stessa transazione della scrittura.
6. **Matrice dei permessi**: test nuovo `crates/bookeeper-core/tests/permissions.rs`, guidato da una tabella. Per ognuno dei quattro ruoli, una richiesta rappresentativa per gruppo di rotte: lettura di libri, scaffali, prestiti, persone e wishlist di famiglia; scrittura di libri, copertine, collocazioni, scaffali, stanze, tag, prestiti, propria wishlist, proprio stato di lettura; export; codice di dispositivo; elenco e revoca dei dispositivi altrui; inviti; ruoli e rimozioni; import; backup; registro attività; ripristino; cambio proprietario. Per ognuna, l'esito atteso (permesso o 403) secondo la tabella "Ruoli" del contratto. **Se una rotta esistente non rispetta la tabella, NON correggerla: fermati e dillo nel rapporto, con la rotta e l'esito.**

## Test

- `tests/people_api.rs`: elenco e ordine; `email` solo per admin e proprietario; ogni regola di "Chi gestisce chi" (cambio di ruolo, nome, rimozione) con l'esito giusto; rimozione con i suoi effetti (dispositivo che smette di funzionare alla richiesta successiva, stato di lettura e wishlist spariti, libro e prestito con il riferimento a `NULL` e il nome del prestito intatto); uscita volontaria; il proprietario non può uscire; cambio proprietario (ruoli dopo, un solo proprietario, verso sé stesso 422, da un admin 403); isolamento tra librerie (404).
- `tests/invites_api.rs`: creazione per ruolo e per chi agisce (admin non invita admin); scadenza predefinita e su misura, fuori intervallo 422; elenco senza i codici usati né scaduti; revoca; `inspect` per invito e per dispositivo, codice falso 401, nessun consumo; riscatto: persona creata con il ruolo giusto, sessione funzionante, `display_name` mancante 422 senza consumo del codice, secondo riscatto 401, due riscatti concorrenti con un solo successo; limite di tentativi condiviso; audit.
- `tests/permissions.rs`: la matrice.
- `tests/db.rs`: la migrazione `0003` si applica a un database creato con le migrazioni `0001` e `0002` e già popolato.
- I test esistenti di abbinamento e dispositivi restano verdi.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-server` passa.
- Cambiano solo file sotto `crates/bookeeper-core/src/api/`, `crates/bookeeper-core/src/auth/`, `crates/bookeeper-core/src/db/`, `crates/bookeeper-core/src/openapi.rs`, `crates/bookeeper-core/tests/`, e `packages/api/openapi.json` (aggiornata solo con il comando del contratto). Elenca nel rapporto i file toccati.
