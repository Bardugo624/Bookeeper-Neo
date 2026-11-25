# Contratto del run 1E

Valgono regole, convenzioni ed errori di `docs/forge/fase-1a/CONTRATTO.md`, `docs/forge/fase-1b/CONTRATTO.md`, `docs/forge/fase-1c/CONTRATTO.md` e `docs/forge/fase-1d/CONTRATTO.md`. Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- **Nessuna task modifica `Cargo.toml` o `Cargo.lock`.** Se manca una dipendenza, fermati e dillo.
- Un solo fornitore crittografico, `ring`: resta valida la regola del run 1D.
- Nessun accesso a Internet nei test. Connessioni a `127.0.0.1` su porta `0` sono permesse.
- Nessun test che afferma uno stato provvisorio.
- Formatta solo i tuoi file: `rustfmt --edition 2021 <file>`. Non eseguire `cargo fmt --all`.
- Gli alberi 0.3 (`server/`, `clients/`, `deploy/`) e `.github/workflows/deploy-server.yml` si leggono, non si modificano.
- Messaggi stampati per l'utente: in italiano. Log e commenti: in inglese.
- Ogni correzione ha un test che fallisce prima e passa dopo, salvo dove la task dice altrimenti.

## Configurazione del server: domini (da `domains`)

`Config.domain: Option<String>` diventa `Config.domains: Vec<String>`.

| Flag | Variabile | Forma |
| --- | --- | --- |
| `--domain` | `BOOKEEPER_DOMAIN` | ripetibile; ogni valore può contenere più nomi separati da virgola |

- I nomi sono portati in minuscolo; i doppioni sono scartati; l'ordine è quello di scrittura.
- Il **primo** nome è il principale: con `acme` l'indirizzo pubblico predefinito è `https://<primo>` (più `:porta` se non 443).
- Con `acme` serve almeno un nome. Ogni nome DEVE essere un nome DNS valido.
- Con `acme` un solo certificato copre tutti i nomi. Con `self` tutti i nomi entrano nel certificato autogenerato.

## Errori di avvio (da `server-e`, in `bookeeper_server::StartError`)

```rust
#[error("{0}")]
Tls(String),      // errore TLS o di certificato: non è un errore di configurazione
```

`StartError::Config` resta riservato ai valori di configurazione sbagliati.

## Uscita del server all'avvio

L'ordine del run 1D non cambia. Si aggiunge: la riga `Bookeeper <versione> in ascolto su …` è stampata solo dopo che il certificato (`self`) o il servizio ACME (`acme`) è pronto. Se quel passo fallisce, la riga non compare.

## OpenAPI (da `openapi-e`)

- Ogni operazione con corpo `application/json` documenta 400 `bad_request`, 413 `payload_too_large` e 422 `validation`, con corpo `ApiErrorBody`.
- `ServerOut.public_url` è obbligatorio e annullabile.
- `GET /api/v1/setup` non documenta risposte 4xx: esenzione approvata.
