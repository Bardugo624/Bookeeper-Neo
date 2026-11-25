Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Server: ordine delle righe, messaggi, log e nome annunciato

## Obiettivo

Correggere cinque difetti P3 trovati dal revisore nel run 1D e uno trovato provando l'immagine Docker. Le task `domains` e `net-e` sono già unite: parti dal loro codice.

## 1. "In ascolto" solo quando il certificato è pronto

File: `crates/bookeeper-server/src/main.rs`.

Oggi la riga `Bookeeper … in ascolto su https://…` è stampata prima di caricare l'identità autogenerata. Se il caricamento fallisce, l'utente legge "in ascolto" e poi un errore.

Regola: con `self` carica l'identità e costruisci `TlsServer` prima di stampare la riga; con `acme` costruisci `TlsServer` prima di stampare la riga. L'ordine delle righe del contratto 1D non cambia: codice di setup, "in ascolto", impronta, frase.

## 2. Errori TLS che non parlano di configurazione

File: `crates/bookeeper-server/src/lib.rs`, `crates/bookeeper-server/src/tls.rs`, `crates/bookeeper-server/src/main.rs`.

Aggiungi la variante `StartError::Tls(String)` del contratto. La usano `tls_error` in `tls.rs` e i due rami d'errore del sottocomando `fingerprint` in `main.rs`. Il messaggio di `fingerprint` su una cartella senza certificato diventa esattamente:

```
error: nessun certificato autogenerato in questa cartella: avvia il server una volta con --tls self
```

`StartError::Config` resta per `--tls acme` senza `--domain` e per gli altri valori sbagliati.

## 3. Una sola riga di log per risposta

File: `crates/bookeeper-server/src/layers.rs`.

Oggi una risposta 5xx produce due righe: quella di risposta a INFO e quella di fallimento a ERROR. Regola: una riga per risposta. Livello ERROR per uno stato 5xx, INFO per gli altri. La riga contiene metodo, percorso, stato e latenza; mai query, intestazioni o corpo. Disattiva `on_failure` del `TraceLayer` e scrivi un `on_response` che sceglie il livello dallo stato.

## 4. Niente sequenze di colore fuori da un terminale

File: `crates/bookeeper-server/src/main.rs`.

`docker logs` mostra sequenze ANSI. Regola: `tracing_subscriber::fmt()` usa i colori solo se lo standard output è un terminale (`std::io::IsTerminal`).

## 5. Nome annunciato uguale al nome stampato

File: `crates/bookeeper-server/src/announce.rs`.

Oggi la riga `Annunciato in rete locale come "…"` stampa il nome costruito, ma in rete va `bookeeper_net::mdns::sanitize_instance(nome)`: su `nas.home.lan` si legge `Bookeeper su nas.home.lan` e in rete appare `Bookeeper su nashomelan`.

Regola: estrai `pub fn instance_for(host: &str) -> String`, che restituisce il nome già passato per `sanitize_instance`. `announcement` la usa. La riga stampata e il nome pubblicato coincidono sempre.

## 6. Ciclo attivo nel test

File: `crates/bookeeper-server/tests/announce.rs` (intorno alla riga 95, `the_server_runs_with_mdns_on`).

Se il processo figlio esce presto, `recv_timeout` restituisce subito `Disconnected` e il ciclo gira a vuoto per 30 secondi. Regola: su `Disconnected` il test fallisce subito, con l'uscita del figlio nel messaggio.

## Test

- `crates/bookeeper-server/tests/tls.rs`, `a_broken_identity_never_says_listening`: cartella dati con solo `tls/self/cert.pem` (contenuto qualsiasi), binario avviato con `--tls self --port 0 --mdns off`. Il processo esce con codice diverso da 0, lo standard output non contiene `in ascolto`, lo standard error non contiene `configurazione non valida`.
- `crates/bookeeper-server/tests/tls.rs`, `fingerprint_without_identity_is_not_a_config_error`: `fingerprint --data-dir <cartella vuota>` esce con codice diverso da 0 e lo standard error è esattamente la riga del punto 2.
- Il test esistente `fingerprint_subcommand_prints_what_the_server_printed` resta verde: l'ordine delle righe non cambia.
- `crates/bookeeper-server/src/layers.rs`, modulo `#[cfg(test)]`, `a_500_is_logged_once_at_error` e `a_200_is_logged_once_at_info`: router di prova con una rotta che risponde 500 e una che risponde 200, passato per `apply`; cattura i log con un `MakeWriter` in memoria e `tracing::subscriber::set_default` su un runtime a thread singolo; conta le righe che citano il percorso.
- `crates/bookeeper-server/tests/serve.rs`, `piped_logs_carry_no_colour_codes`: binario avviato con lo standard output su pipe e `--mdns off`, una richiesta a `/api/v1/health`, poi arresto; l'uscita raccolta non contiene il byte `0x1b`.
- `crates/bookeeper-server/tests/announce.rs`, `the_printed_name_is_the_published_name`: `instance_for("nas.home.lan")` è uguale a `sanitize_instance` di sé stesso e non contiene punti; lo stesso per un nome host di 100 caratteri.

## Acceptance criteria

- `cargo test -p bookeeper-server` passa.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` passa.
- Cambiano solo: `crates/bookeeper-server/src/main.rs`, `crates/bookeeper-server/src/lib.rs`, `crates/bookeeper-server/src/tls.rs`, `crates/bookeeper-server/src/layers.rs`, `crates/bookeeper-server/src/announce.rs`, `crates/bookeeper-server/tests/announce.rs`, `crates/bookeeper-server/tests/tls.rs`, `crates/bookeeper-server/tests/serve.rs`.
