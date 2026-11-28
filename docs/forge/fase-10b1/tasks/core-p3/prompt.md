Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Core: «since» facoltativo e id di un'altra libreria

## File
- `crates/bookeeper-core/src/api/annotations.rs` e `crates/bookeeper-core/tests/annotations.rs`.
- `packages/api`, rigenerato con il comando del contratto della 10B.

## Cosa fare
- `AnnotationsQuery` riceve `#[into_params(parameter_in = Query)]`: in `openapi.json` e in `schema.d.ts` `since` è un parametro di query facoltativo, non di percorso obbligatorio.
- Il PUT cerca la riga esistente per `id` su tutto il server, non solo nella libreria. Una riga di un'altra libreria o di un'altra persona risponde 404, mai un errore 500 sulla chiave primaria.

## Test
- `since_is_an_optional_query_parameter`: lo controlla sul documento OpenAPI.
- `an_id_from_another_library_is_404`: due librerie, la stessa id; il secondo PUT risponde 404 e la prima riga resta com'era.

## Acceptance criteria
- `cargo test -p bookeeper-core --test annotations --test openapi` e `npm test -w @bookeeper/api` passano.
- `cargo fmt --all -- --check` passa.
