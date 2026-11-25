# Contratto del run 1D

Valgono regole, convenzioni ed errori di `docs/forge/fase-1a/CONTRATTO.md`, `docs/forge/fase-1b/CONTRATTO.md` e `docs/forge/fase-1c/CONTRATTO.md`. Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- `Cargo.toml` e `Cargo.lock`: li modificano `plumbing-d` (core e `bookeeper-net`) e `config-d` (server). Eccezioni: `net-tls` può modificare `crates/bookeeper-net/Cargo.toml` e `Cargo.lock`; `tls-serve` può modificare `crates/bookeeper-server/Cargo.toml` e `Cargo.lock`. Le altre task, se manca una dipendenza, si fermano e lo dicono.
- `crates/bookeeper-core/src/state.rs` lo modifica solo `plumbing-d`.
- **Un solo fornitore crittografico: `ring`.** `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys` e `cargo tree -i openssl-sys` NON DEVONO trovare nulla. Chi usa `rustls` chiama prima `bookeeper_net::install_crypto_provider()`.
- **Nessun accesso a Internet nei test.** Connessioni a `127.0.0.1` su porta `0` sono permesse. Un test che ha bisogno del multicast è `#[ignore]`.
- **Nessun test che afferma uno stato provvisorio** (per esempio "questa rotta non esiste ancora").
- Formatta solo i tuoi file: `rustfmt --edition 2021 <file>`. Non eseguire `cargo fmt --all`.
- Gli alberi 0.3 (`server/`, `clients/`, `deploy/`) e `.github/workflows/deploy-server.yml` si leggono, non si modificano.
- Messaggi stampati per l'utente: in italiano. Log e commenti: in inglese.

## Stato dell'app (da `plumbing-d`, in `bookeeper_core::state`)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
pub enum TlsMode { Local, Off, SelfSigned, Acme }   // JSON: "local" | "off" | "self" | "acme"

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerInfo { pub tls: TlsMode, pub public_url: Option<String> }
impl ServerInfo {
    pub fn local() -> Self;               // Local, nessun indirizzo pubblico: il core dentro l'app
    pub fn phone_ready(&self) -> bool;    // public_url inizia con "https://" e tls != SelfSigned
}

AppState { …, pub server: Arc<ServerInfo> }          // predefinito: ServerInfo::local()
impl AppState { pub fn with_server(self, info: ServerInfo) -> Self; }
```

## Configurazione del server (da `config-d`, in `bookeeper_server::config`, riesportata dalla radice)

| Flag | Variabile | Predefinito |
| --- | --- | --- |
| `--data-dir` | `BOOKEEPER_DATA` | `./data` |
| `--bind` | `BOOKEEPER_BIND` | `0.0.0.0` |
| `--port` | `BOOKEEPER_PORT` | `443` con `acme`, altrimenti `7842` |
| `--tls off\|self\|acme` | `BOOKEEPER_TLS` | `off` |
| `--domain` | `BOOKEEPER_DOMAIN` | — (obbligatorio con `acme`) |
| `--acme-email` | `BOOKEEPER_ACME_EMAIL` | — |
| `--acme-directory` | `BOOKEEPER_ACME_DIRECTORY` | Let's Encrypt, produzione |
| `--public-url` | `BOOKEEPER_PUBLIC_URL` | con `acme`: `https://<dominio>` (più `:porta` se non 443) |
| `--mdns on\|off` | `BOOKEEPER_MDNS` | `on` |

```rust
impl Config {
    pub fn for_data_dir(dir: impl Into<PathBuf>) -> Self;   // tutti i predefiniti
    pub fn listen_port(&self) -> u16;
    pub fn validate(&self) -> Result<(), StartError>;       // StartError::Config(String)
    pub fn public_url(&self) -> Option<String>;             // senza barra finale
    pub fn server_info(&self) -> ServerInfo;
}
```

File su disco: `<dati>/tls/self/{cert.pem,key.pem}`, `<dati>/tls/acme/` (cache ACME).

## Crate `bookeeper-net` (scheletro da `plumbing-d`)

```rust
pub fn install_crypto_provider();                 // ring; idempotente
pub enum NetError { Io(std::io::Error), Tls(String), Mdns(String) }

// tls.rs — net-tls
pub struct Identity { pub cert_pem: String, pub key_pem: String, pub fingerprint: [u8; 32] } // SHA-256 del certificato DER
impl Identity {
    pub fn load(dir: &Path) -> Result<Option<Identity>, NetError>;
    pub fn load_or_create(dir: &Path, names: &[String]) -> Result<Identity, NetError>;
    pub fn fingerprint_hex(&self) -> String;                                   // "AB:CD:…", 32 gruppi
    pub fn server_config(&self) -> Result<Arc<rustls::ServerConfig>, NetError>; // ALPN h2 e http/1.1
}
pub fn pinned_client_config(fingerprint: [u8; 32]) -> Arc<rustls::ClientConfig>;

// phrase.rs — net-tls
pub fn verification_phrase(fingerprint: &[u8; 32]) -> String;   // sei parole separate da uno spazio

// mdns.rs — net-mdns
pub const SERVICE_TYPE: &str = "_bookeeper._tcp.local.";
pub struct Announcement { pub instance: String, pub port: u16, pub version: String, pub tls: String, pub url: Option<String> }
pub struct Announcer;                              // ritira l'annuncio al drop
pub fn announce(a: &Announcement) -> Result<Announcer, NetError>;
pub struct Found { pub instance: String, pub host: String, pub addrs: Vec<IpAddr>, pub port: u16, pub version: String, pub tls: String, pub url: Option<String> }
pub async fn browse(timeout: Duration) -> Result<Vec<Found>, NetError>;
```

## Rotta aggiunta

| Metodo e percorso | Accesso | Risposta |
| --- | --- | --- |
| `GET /api/v1/server` | pubblica | 200 `{version, tls, public_url, phone_ready}` |

## Uscita del server all'avvio (stdout, in quest'ordine)

```
Codice di setup: XXXX-XXXX-XXXX                  solo se non esiste alcuna libreria
Bookeeper <versione> in ascolto su <schema>://<indirizzo>
Impronta del certificato: AB:CD:…                solo con --tls self
Frase di verifica: <sei parole>                  solo con --tls self
```

## Sottocomandi

`setup-code` (esiste), `fingerprint` (da `tls-serve`), `healthcheck` (da `healthcheck`). Nessuno apre una porta in ascolto.
