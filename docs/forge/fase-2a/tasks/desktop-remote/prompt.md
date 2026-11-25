Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# Guscio: trasporto remoto, impronta fissata, scoperta

## Obiettivo

Oggi l'app parla solo col core in processo. I percorsi "Unisciti" e "Crea su un server" devono parlare con un server remoto. Il design (§6.4, Trasporto) vuole che sia il guscio Rust a farlo, con l'impronta del certificato fissata quando il certificato è autogenerato.

La task `desktop-session` è già unita: usa il suo `Store`. Leggi `dispatch.rs`, `crates/bookeeper-net/src/tls.rs`, `phrase.rs` e `mdns.rs`.

## Cosa fare

1. **`remote.rs`**: un client per connessione remota, tenuto in una cache per `(url, fingerprint)`. `reqwest` con `rustls` e solo `ring` (`default-features = false`, funzioni `rustls-tls-webpki-roots-no-provider` o equivalenti: verifica con `cargo tree`). Chiama `bookeeper_net::install_crypto_provider()` prima di costruire. Con `fingerprint`: `use_preconfigured_tls(pinned_client_config(..))`. Tempo massimo: 10 secondi per connettersi, 60 per la risposta. Nessun reindirizzamento seguito.
   Due funzioni che restituiscono gli stessi `ApiResponse` e `RawApiResponse` di `dispatch.rs`: stesse regole su metodo, percorso `/api/` e intestazioni ammesse. Fattorizza quelle regole in `dispatch.rs` invece di copiarle. Intestazioni di risposta riportate nel caso binario: le stesse del caso in processo.
2. **Indirizzi.** Funzione pura `is_local_address(host: &str) -> bool` con le reti del contratto. `http://` verso un indirizzo non locale: 400 `insecure_address`, senza aprire alcuna connessione. Un nome DNS non `.local` con `http://` è non locale: non si risolve il nome per decidere.
3. **Instradamento.** `api_request` e `api_request_raw` ricevono `connection_id: Option<String>` e seguono la regola del contratto. Un `connection_id` sconosciuto: 400 `bad_request`.
4. **`server_probe(url)`** secondo il contratto. Ordine: normalizza l'indirizzo (aggiungi `https://` se manca lo schema; togli la barra finale); controlla la regola `http`; prova con le radici WebPKI; se il certificato non è fidato, riprova accettando qualunque certificato SOLO per leggerne l'impronta e la frase, e per leggere `/api/v1/server` e `/api/v1/setup`; in quel caso `trusted` è `false`. Nessun token viene mai inviato in una connessione non fidata e non fissata. Se `/api/v1/server` non risponde con il JSON atteso: `error: "not_bookeeper"`.
5. **`discover.rs`**: comando `discover()` che chiama `bookeeper_net::mdns::browse(Duration::from_secs(2))`. Un errore di mDNS restituisce una lista vuota e scrive un `warn`.
6. Dipendenze nuove solo in `apps/desktop/src-tauri/Cargo.toml`: `bookeeper-net`, `reqwest`, `rustls`, `tokio` se serve.

## Test

In `apps/desktop/src-tauri/tests/remote.rs`. I server di prova si avviano in processo su `127.0.0.1:0` con il router del core (`bookeeper_core::router`) e, per il caso TLS, con `bookeeper_net::tls::Identity` e `axum-server` solo se è già una dipendenza raggiungibile; altrimenti con `tokio-rustls` come dipendenza di sviluppo.

- `is_local_address`: tabella di casi veri (`127.0.0.1`, `localhost`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.1.10`, `169.254.1.1`, `[::1]`, `fd00::1`, `fe80::1`, `nas.local`) e falsi (`172.32.0.1`, `8.8.8.8`, `example.org`, `local`, `nas.local.example.org`, `2001:db8::1`).
- `plain_http_to_a_public_address_is_refused`: 400 `insecure_address`, e nessuna connessione viene tentata (indirizzo non instradabile, risposta immediata).
- `a_remote_connection_reaches_the_server`: `GET /api/v1/health` su un server http locale dà 200 e lo stesso corpo del core.
- `headers_and_bodies_pass_through`: `POST /api/v1/setup` remoto crea la libreria; `Authorization` arriva al server (`GET /api/v1/me` dà 200).
- `a_pinned_fingerprint_is_accepted` e `a_different_fingerprint_is_refused` (stato `0`, `network`).
- `a_self_signed_server_without_a_pin_is_refused`.
- `probe_reports_an_untrusted_certificate`: `trusted == false`, `fingerprint` uguale a quella dell'identità, `phrase` uguale a `verification_phrase`, `server` e `setup` presenti.
- `probe_of_a_plain_local_server_is_trusted`.
- `probe_of_something_else_is_not_bookeeper`: un server che risponde 200 con HTML.
- `probe_of_a_dead_port_is_unreachable`.
- `an_unknown_connection_id_is_a_bad_request`.
- `without_a_connection_the_core_answers`: comportamento di oggi invariato.
- `discover_returns_a_list`: `#[ignore]`, multicast.
- I test esistenti di `dispatch` restano verdi.

## Acceptance criteria

- `cargo test -p bookeeper-desktop` passa.
- `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passa.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys`, `cargo tree -i openssl-sys` non trovano nulla.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/remote.rs`, `apps/desktop/src-tauri/src/discover.rs`, `apps/desktop/src-tauri/src/dispatch.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, file sotto `apps/desktop/src-tauri/tests/`.
