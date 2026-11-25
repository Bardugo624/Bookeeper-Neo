Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Configurazione: host numerici e test appeso

## Obiettivo

Correggere i due difetti P3 trovati dal revisore nel run 1E.

## 1. Host numerici non validi in `--public-url`

File: `crates/bookeeper-server/src/config.rs` (controllo dell'indirizzo pubblico, intorno alla riga 255).

Oggi, quando l'analisi IPv4 fallisce, l'host ricade su `is_dns_name`, che accetta etichette fatte solo di cifre. Passano `http://999.999.999.999:7842` e `http://1.2.3`.

Regola: un host la cui ultima etichetta è fatta solo di cifre DEVE essere un indirizzo IPv4 valido (`std::net::Ipv4Addr`), altrimenti è rifiutato. Un nome DNS con etichette numeriche non finali (`1.example.org`, `123.libri.example.org`) resta accettato. La regola vale solo per `--public-url`: `--domain` non cambia.

## 2. Test che resta appeso

File: `crates/bookeeper-server/tests/config.rs`, test `domains_come_from_the_environment` (intorno alla riga 181).

Il test aspetta 5 righe sullo standard output del server, ma il programma ne stampa 3; le altre 2 vengono dai log. Con `RUST_LOG=off` non arrivano mai e il test non termina.

Regola: il test smette di leggere appena arriva la riga `Certificato richiesto per`, non dipende dal numero di righe e non dipende dai log. In più ha un limite di tempo: se la riga non arriva entro 30 secondi fallisce con l'uscita raccolta nel messaggio. Il processo figlio è sempre terminato alla fine, anche in caso di fallimento.

## Test

In `crates/bookeeper-server/tests/config.rs`:

- `public_url_rejects_numeric_hosts_that_are_not_ipv4`: `http://999.999.999.999:7842`, `http://1.2.3`, `https://256.1.1.1`, `https://1.2.3.4.5` sono rifiutati.
- `public_url_accepts_dns_names_with_numeric_labels`: `https://1.example.org`, `https://123.libri.example.org`, `http://192.168.1.10:7842` sono accettati.
- I test esistenti restano verdi senza modifiche, salvo `domains_come_from_the_environment`.

## Acceptance criteria

- `cargo test -p bookeeper-server --test config` passa.
- `RUST_LOG=off cargo test -p bookeeper-server --test config` passa.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` passa.
- Cambiano solo: `crates/bookeeper-server/src/config.rs`, `crates/bookeeper-server/tests/config.rs`.
