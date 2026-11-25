# Contratto del run 2D

Valgono per intero i contratti `docs/forge/fase-2a`, `fase-2b`, `fase-2c` e `docs/forge/fase-2a/MOCKUP.md`; per il lato Rust anche `docs/forge/fase-1d/CONTRATTO.md` (un solo fornitore crittografico `ring`, niente Internet nei test, multicast `#[ignore]`). Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- **Dipendenze Rust**: le aggiungono solo `keychain`, `sharing-core` e `updater`, in `apps/desktop/src-tauri/Cargo.toml`. `cargo tree -i aws-lc-rs`, `-i aws-lc-sys`, `-i openssl-sys` NON DEVONO trovare nulla. Nessuna dipendenza npm nuova salvo i pacchetti JavaScript dei plugin Tauri usati da `updater`, che li installa.
- Nessuna modifica al core né a `crates/bookeeper-net`: se manca qualcosa, la task si ferma e lo dice.
- I segreti (token, password, chiave privata del certificato) non compaiono mai in log, errori o `Debug`.
- Tutto ciò che dipende dal sistema (portachiavi, finestra, rete) sta dietro un tratto con un'implementazione in memoria per i test.

## Portachiavi (da `keychain`, in `secrets.rs`)

```rust
pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}
```

- Servizio `org.bookeeper.desktop`; chiave `<id connessione>/access` e `<id connessione>/refresh`.
- `connections.json` non contiene più token. I tipi e i comandi verso la webview NON cambiano: `Connection` ha ancora `access_token` e `refresh_token`, riempiti dal portachiavi alla lettura e scritti nel portachiavi al salvataggio.
- **Migrazione**: al primo avvio i token trovati nel file passano al portachiavi e il file è riscritto senza. Se il portachiavi rifiuta la scrittura, il file resta com'è.
- **Ripiego**: se il portachiavi non è disponibile (Linux senza servizio dei segreti), i token restano nel file `0600` come oggi e `connections_get` aggiunge `"secrets": "file"`; altrimenti `"secrets": "keychain"`.
- Rimuovere una connessione cancella le sue voci dal portachiavi.

## Condivisione in rete (da `sharing-core`, in `sharing.rs`)

Lo stesso router del core, servito in LAN con il certificato autogenerato dell'app (`bookeeper_net::tls::Identity` in `<dati>/tls/self/`) e annunciato via mDNS (`bookeeper_net::mdns`, `tls: "self"`).

```rust
pub struct SharingStatus {
    pub enabled: bool,          // preferenza salvata
    pub running: bool,
    pub port: u16,              // predefinita 7842
    pub addresses: Vec<String>, // https://<ip>:<porta> per ogni indirizzo IPv4 privato della macchina
    pub fingerprint: Option<String>,
    pub phrase: Option<String>, // frase di verifica, sei parole
    pub error: Option<String>,  // "port_in_use" | "password_required" | "tls" | "mdns"
}
```

Comandi: `sharing_status()`, `sharing_set(enabled: bool, port: Option<u16>)` → `SharingStatus`.

- La preferenza sta in `sharing.json` nella cartella dati. Con `enabled: true` la condivisione riparte all'avvio dell'app.
- **Password obbligatoria** (design §6.4): attivare la condivisione su una libreria il cui proprietario non ha una password dà `password_required` e non apre nulla. Leggi nel core come si sa se la password esiste.
- La porta è aperta solo mentre la condivisione è attiva; lo spegnimento chiude le connessioni entro 10 secondi e ritira l'annuncio.
- Un errore di mDNS non impedisce la condivisione: `running: true` con `error: "mdns"`.
- Chi si collega da fuori usa le rotte normali: abbinamento con codice, oppure email e password.

## Aggiornamenti (da `updater`)

- Indirizzo del manifest: `https://app.neokeeper.dev/updates/<canale>/latest.json`, canali `stable` e `beta`. Base configurabile alla build con `BOOKEEPER_UPDATE_BASE`.
- Chiave pubblica di firma: `option_env!("BOOKEEPER_UPDATER_PUBKEY")` alla build. Assente: gli aggiornamenti sono spenti.

```rust
pub enum UpdateState { Disabled, UpToDate, Available { version: String, notes: String, date: Option<String> }, Error { code: String } }
// comandi: update_check(channel) -> UpdateState; update_install(channel) -> () (scarica, verifica la firma, installa, riavvia)
// evento verso la webview: "update://progress" { downloaded, total }
```

- Canale salvato in `localStorage` (`stable` predefinito).
- Controllo all'avvio e ogni 6 ore; mai durante un'installazione.
- **Mai bloccante**: un aggiornamento disponibile mostra un banner sopra il contenuto con "Vedi le novità" e "Più tardi"; "Più tardi" lo nasconde per quella versione.
- Con `Disabled` non esiste alcuna interfaccia di aggiornamento, salvo la riga della versione in Informazioni.

## Rilascio desktop (da `release-desktop`)

- Tag `v2.*`. Versione con suffisso (`-beta.1`) → canale `beta`; senza → `stable` (che aggiorna anche il manifest `beta`).
- Installer: Windows NSIS, macOS DMG (arm64 e x86_64), Linux AppImage e deb. Nessuna firma del codice.
- Artefatti di aggiornamento firmati con i secret `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; la chiave pubblica arriva alla build dalla variabile di repository `BOOKEEPER_UPDATER_PUBKEY`. Senza i secret: installer costruiti, nessun artefatto di aggiornamento, nessun manifest, e il workflow lo dice.
- Manifest nel formato dell'updater di Tauri v2, generato da `scripts/update-manifest.mjs`.
- Pubblicazione: installer nella release di GitHub; artefatti di aggiornamento e manifest sulla VPS in `/opt/bookeeper/updates/` via SSH con il secret `VPS_SSH_KEY`, serviti da Caddy sotto `https://app.neokeeper.dev/updates/`. Il manifest si scrive per ultimo, in modo atomico.
