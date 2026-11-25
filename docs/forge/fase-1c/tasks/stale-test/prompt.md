Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Togliere un test diventato falso

## Obiettivo

La verifica dell'insieme fallisce su un solo test: `stub_lookup_returns_none` in `crates/bookeeper-core/tests/plumbing_c.rs`. Quel test affermava che `LookupService::lookup` restituisce sempre `None`, cosa vera solo finché il servizio era vuoto. Ora il servizio è implementato, il test interroga i fornitori veri attraverso la rete e riceve un risultato. È sbagliato due volte: afferma una cosa non più vera, e accede alla rete, cosa che il contratto vieta ai test.

## Cosa fare

1. In `tests/plumbing_c.rs` sostituisci `stub_lookup_returns_none` con `lookup_without_providers_is_none`: `LookupService::with_providers(vec![])` → `lookup(...)` restituisce `None`. Nessun accesso alla rete.
2. Controlla che nessun altro test di quel file usi `AppState::for_tests().lookup` o `LookupService::new(...)` per chiamare `lookup`: se ne trovi, passali a fornitori finti o a `with_providers(vec![])`.
3. Non toccare altri file né altri test.

## Acceptance criteria

- `cargo test -p bookeeper-core --test plumbing_c` passa con otto test.
- `grep -n "stub_lookup_returns_none" crates/bookeeper-core/tests/plumbing_c.rs` non trova nulla.
- Il file di test non contiene chiamate a `lookup(` su un servizio costruito con `LookupService::new` o preso da `AppState`.
- Cambia solo `crates/bookeeper-core/tests/plumbing_c.rs`.
