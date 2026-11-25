# Contratto della fase 1A

Vale per ogni task di questo run. Dove una task e questo file divergono, vince questo file.

## Regole comuni

- NON modificare nulla sotto `server/`, `clients/`, `deploy/` (versione 0.3 congelata).
- Solo la task `plumbing` modifica `Cargo.toml` e `Cargo.lock`. Le altre usano le dipendenze già presenti. Se ne manca una, fermati e dillo nel messaggio finale.
- Tocca solo i file dichiarati per la tua task.
- Test prima del codice. Esegui solo i test della tua task, mai l'intera suite.
- Comandi Rust: sempre con `-p bookeeper-core` o `-p bookeeper-server`. Non compilare `bookeeper-desktop` se la task non lo richiede: è lento.
- Prima di finire: `cargo fmt` e `cargo clippy -p <crate> --all-targets -- -D warnings`.
- Codice e commenti in inglese. Commenti solo dove il codice non si spiega da solo.
- La parola `tenant` è vietata: `libraries` è la libreria di famiglia, `rooms` le stanze.
- Niente `unwrap()`/`expect()` nel codice non di test, salvo invarianti documentate.

## Convenzioni dell'API

- Prefisso `/api/v1`. JSON con campi `snake_case`.
- Identificativi: UUID v7 come stringa. Tempi: secondi Unix (`i64`).
- Email: normalizzata con `trim` e minuscole prima di salvare e di confrontare.
- Accesso al database dalle rotte: solo con `state.db.run(move |conn| …).await`, mai `Db::with`.
- Corpo delle richieste: estrattore `ApiJson<T>`, mai `axum::Json<T>`.
- Ogni rotta è annotata con `#[utoipa::path]` ed elencata nel `Doc` del proprio modulo.
- Ogni rotta protetta prende `AuthUser` come argomento.

## Errori

Corpo: `{"error_code": "...", "message": "..."}`. Il `message` è in inglese e non contiene dati sensibili.

| Stato | `error_code` | Quando |
| --- | --- | --- |
| 400 | `bad_request` | JSON malformato o tipo di contenuto errato |
| 401 | `unauthorized` | token assente o non valido |
| 401 | `token_expired` | token di accesso scaduto |
| 401 | `device_revoked` | dispositivo revocato |
| 401 | `invalid_credentials` | email o password errate |
| 401 | `refresh_invalid` | token di rinnovo sconosciuto o scaduto |
| 401 | `refresh_reused` | token di rinnovo già ruotato: il dispositivo viene revocato |
| 401 | `pairing_code_invalid` | codice di abbinamento errato, scaduto o già usato |
| 403 | `forbidden` | ruolo insufficiente |
| 403 | `setup_code_invalid` | codice di setup errato |
| 404 | `not_found` | risorsa inesistente o di un'altra libreria |
| 409 | `setup_closed` | setup locale già fatto |
| 409 | `library_choice_required` | le credenziali valgono per più librerie |
| 409 | `password_required` | cambio password senza quella attuale |
| 422 | `validation` | campo mancante o fuori dai limiti |
| 429 | `rate_limited` | troppi tentativi; intestazione `Retry-After` in secondi |

## Tipi condivisi (modulo `bookeeper_core::auth`)

```rust
pub enum Role { Owner, Admin, Member, Guest }        // serde e DB: "owner" | "admin" | "member" | "guest"
impl Role { pub fn as_str(&self) -> &'static str; pub fn at_least(&self, min: Role) -> bool; }  // Owner > Admin > Member > Guest
impl std::str::FromStr for Role

pub enum DeviceKind { Desktop, Mobile }              // "desktop" | "mobile"

pub struct Identity { pub library_id: String, pub user_id: String, pub device_id: String, pub role: Role }

pub struct Session {                                  // Serialize + ToSchema
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,                              // 900
}
```

Costanti: `ACCESS_TTL_SECS = 900`, `REFRESH_TTL_SECS = 2_592_000` (30 giorni, a scorrimento), `PAIRING_TTL_SECS = 600`.

Alfabeto dei codici: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (senza `0 O 1 I L`).
Codice di abbinamento: 8 caratteri. Codice di setup: 12 caratteri, mostrato come `XXXX-XXXX-XXXX`.
Confronto dei codici: maiuscole, senza spazi né trattini, poi SHA-256 esadecimale.

## Oggetti nelle risposte

```
LibraryOut { id, name }
UserOut    { id, display_name, email: string|null, role }
DeviceOut  { id, name, kind, user_id, user_name, paired_at, last_seen: i64|null, revoked_at: i64|null, current: bool }
AuthOut    { library: LibraryOut, user: UserOut, session: Session }
```

## Rotte

| Metodo e percorso | Accesso | Corpo | Risposta |
| --- | --- | --- | --- |
| `GET /setup` | pubblico | — | 200 `{needs_setup, code_required}` |
| `POST /setup` | pubblico | `{library_name, display_name, email?, password?, setup_code?, device_name, device_kind}` | 201 `AuthOut` |
| `POST /auth/login` | pubblico | `{email, password, library_id?, device_name, device_kind}` | 200 `AuthOut` |
| `POST /auth/libraries` | pubblico | `{email, password}` | 200 `{libraries: [LibraryOut]}` |
| `POST /auth/refresh` | pubblico | `{refresh_token}` | 200 `{session}` |
| `POST /auth/logout` | `AuthUser` | — | 204 |
| `POST /auth/password` | `AuthUser` | `{current_password?, new_password}` | 204 |
| `GET /me` | `AuthUser` | — | 200 `{library, user, device: DeviceOut}` |
| `POST /pairing/codes` | membro o più | — | 201 `{code, expires_at}` |
| `POST /pairing/redeem` | pubblico | `{code, device_name, device_kind}` | 200 `AuthOut` |
| `GET /devices` | `AuthUser` | — | 200 `{devices: [DeviceOut]}` |
| `PATCH /devices/{id}` | `AuthUser` | `{name}` | 200 `DeviceOut` |
| `POST /devices/{id}/revoke` | `AuthUser` | — | 204 |

## Validazione

`library_name`, `display_name`, `device_name`: da 1 a 80 caratteri dopo `trim`.
`email`: contiene `@`, al più 254 caratteri. `password` e `new_password`: almeno 8 caratteri, al più 256.
`device_kind`: `desktop` o `mobile`. Ogni violazione: 422 `validation`.
