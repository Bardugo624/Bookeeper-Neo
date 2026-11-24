Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Rete: identità autogenerata, impronta, frase di verifica

## Obiettivo

Il server in modalità `self` (e, in fase 2, l'app desktop in condivisione) usa un certificato autogenerato. Chi si collega non può verificarlo con una CA: lo **fissa** per impronta, e le due persone confrontano una frase derivata dall'impronta (design §6.4). Qui nasce il codice condiviso, nel crate `bookeeper-net`. Firme nel contratto.

## Cosa fare

1. **`src/tls.rs` — `Identity`.**
   - `load_or_create(dir, names)`: se `<dir>/cert.pem` e `<dir>/key.pem` esistono, li carica; altrimenti genera chiave ECDSA P-256 e certificato autofirmato con `rcgen`, validità 10 anni, nomi alternativi `names` (nomi DNS o indirizzi IP; se vuoto: `localhost`). Crea `dir` se manca. Su Unix `key.pem` ha permessi `0600` fin dalla creazione, non dopo. Scrittura atomica: file temporaneo nella stessa cartella, poi rinomina.
   - Una coppia presente ma illeggibile o incoerente è un errore `NetError::Tls`: mai rigenerare in silenzio, perché cambierebbe l'impronta che i client hanno fissato.
   - `load(dir)`: `Ok(None)` se i file non esistono.
   - `fingerprint`: SHA-256 del certificato in DER. `fingerprint_hex`: maiuscolo, a coppie separate da `:`.
   - `server_config()`: `rustls::ServerConfig` senza autenticazione del client, ALPN `h2` e `http/1.1`.
2. **`src/tls.rs` — `pinned_client_config(fingerprint)`.** `rustls::ClientConfig` con un verificatore proprio che accetta **solo** il certificato la cui impronta SHA-256 coincide (confronto a tempo costante), ignorando nome e scadenza. Le firme dell'handshake (`verify_tls12_signature`, `verify_tls13_signature`) DEVONO essere verificate davvero con gli algoritmi del fornitore `ring`: senza, chiunque possieda il certificato pubblico potrebbe impersonare il server.
3. **`src/phrase.rs` — `verification_phrase`.** Lista fissa di 256 parole italiane, incorporata nel sorgente: minuscole, solo `a–z`, da 4 a 8 lettere, tutte diverse, comuni e neutre (niente nomi propri, niente parole offensive). La frase sono le sei parole indicizzate dai primi sei byte dell'impronta, separate da uno spazio. La lista è parte del protocollo: un commento dice che non va mai riordinata né modificata.
4. Puoi modificare `crates/bookeeper-net/Cargo.toml` e `Cargo.lock` se una dipendenza scelta dalle task di fondamenta non basta. Dichiaralo nel rapporto.

## Test

`crates/bookeeper-net/tests/tls.rs`:

- `creates_once_and_loads_the_same_identity`: due chiamate sulla stessa cartella → stessa impronta, stessi file.
- `key_file_is_private` (`#[cfg(unix)]`): permessi `0600`.
- `a_corrupt_pair_is_an_error_not_a_new_identity`: `cert.pem` troncato → errore; il file non viene riscritto.
- `a_cert_with_someone_elses_key_is_an_error`.
- `fingerprint_hex_has_32_groups`.
- `handshake_succeeds_with_the_pinned_fingerprint`: server `tokio-rustls` su `127.0.0.1:0` con `server_config()`, client con `pinned_client_config(impronta)`; scambio di pochi byte.
- `handshake_fails_with_another_fingerprint`: client fissato sull'impronta di una seconda identità → l'handshake fallisce.
- `a_stolen_certificate_without_its_key_cannot_impersonate`: server che presenta il certificato dell'identità A con la chiave dell'identità B → il client fissato su A rifiuta.

Test unitari in `phrase.rs`: 256 parole, tutte diverse, regole di forma rispettate; sei parole; stessa impronta → stessa frase; impronte che differiscono in uno dei primi sei byte → frasi diverse; un valore fisso di esempio con la frase attesa scritta per esteso.

## Acceptance criteria

- `cargo test -p bookeeper-net` passa.
- `cargo clippy -p bookeeper-net --all-targets -- -D warnings` è pulito.
- `cargo tree -i aws-lc-rs` non trova alcun pacchetto.
- Le firme pubbliche coincidono con il contratto.
- Cambiano solo: `crates/bookeeper-net/src/tls.rs`, `src/phrase.rs`, `tests/tls.rs`, ed eventualmente `crates/bookeeper-net/Cargo.toml` e `Cargo.lock`.
