Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Dispositivi: elenco, rinomina, revoca

## Obiettivo

Le rotte `GET /api/v1/devices`, `PATCH /api/v1/devices/{id}`, `POST /api/v1/devices/{id}/revoke` in `crates/bookeeper-core/src/api/devices.rs`. Forma di `DeviceOut` nel contratto.

## Regole

**Elenco.** Un `member` o un `guest` vedono solo i propri dispositivi. `admin` e `owner` vedono tutti quelli della libreria. Ordinati per `paired_at` decrescente. I dispositivi revocati sono inclusi, con `revoked_at` valorizzato. `current` è vero solo per il dispositivo che fa la richiesta. `user_name` è il `display_name` dell'utente.

**Rinomina.** Un utente può rinominare i propri dispositivi; `admin` e `owner` qualsiasi dispositivo della libreria. `name` validato come `device_name` nel contratto. Risposta: il `DeviceOut` aggiornato.

**Revoca.** Stesse regole di permesso della rinomina. Usa `sessions::revoke_device`. Risposta 204. Revocare un dispositivo già revocato risponde 204 lo stesso. Un dispositivo può revocare sé stesso.

**Isolamento.** Un `id` inesistente, malformato o di un'altra libreria risponde sempre 404 `not_found`, mai 403: non si deve poter capire se un dispositivo esiste altrove. Un dispositivo della stessa libreria ma di un altro utente, chiesto da un `member`, risponde 403 `forbidden`.

Annota le rotte e registra `DeviceOut` e gli altri schemi in `Doc`. Definisci `DeviceOut` qui come `pub`.

## Test (`crates/bookeeper-core/tests/devices_api.rs`)

Usa `mod common;` (`seed`, `add_user`, `call`).

- `member_sees_only_own_devices`: con due utenti nella libreria, il `member` vede solo i suoi.
- `admin_sees_every_device_of_the_library`.
- `list_marks_the_current_device`: esattamente un elemento ha `current: true`.
- `list_never_shows_another_library`: i dispositivi di una seconda libreria non compaiono nemmeno a un `owner`.
- `rename_own_device`: 200 e il nuovo nome compare nell'elenco.
- `rename_validates_the_name`: nome vuoto o di 81 caratteri → 422 `validation`.
- `member_cannot_rename_someone_elses_device`: 403 `forbidden`.
- `admin_can_rename_any_device_of_the_library`.
- `revoke_own_other_device`: 204; il token di accesso di quel dispositivo riceve poi 401 `device_revoked` su `GET /devices`.
- `revoke_is_idempotent`: la seconda volta ancora 204.
- `device_can_revoke_itself`: poi la sua richiesta successiva → 401 `device_revoked`.
- `device_of_another_library_is_not_found`: rinomina e revoca → 404 `not_found`, e il dispositivo resta attivo.
- `unknown_and_malformed_ids_are_not_found`: un UUID inesistente e la stringa `abc` → 404.
- `routes_need_a_token`: le tre rotte senza token → 401 `unauthorized`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test devices_api` passa con i quattordici test.
- Solo `api/devices.rs` e `tests/devices_api.rs` sono cambiati.
- Le tre rotte compaiono in `bookeeper_core::openapi()`.
- Nessuna query legge o scrive `devices` senza filtrare per `library_id`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
