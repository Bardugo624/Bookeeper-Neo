Leggi prima `docs/forge/fase-10a/CONTRATTO.md`.

# Un test della pulizia dei file che non dipende dai tempi

## Obiettivo
`the_router_sweeps_at_startup_but_only_once_an_hour`, in `crates/bookeeper-core/tests/ebook_api.rs`, è instabile. Nella verifica dell'insieme (`cargo test --workspace`, con la macchina carica) è fallito con «throttled to once an hour»; alla riprova è passato.

## Causa
La prima costruzione del router, dentro `upload`, avvia la pulizia d'avvio in background. Se quella pulizia parte tardi, dopo che il test ha invecchiato il file con `age(…, 30)`, trova un file vecchio e non attaccato e lo cancella. Il limite di una pulizia all'ora funziona: è il test che non aspetta la fine della prima pulizia.

## Cosa fare
- Il test aspetta la fine della pulizia d'avvio prima di invecchiare il file. Per esempio: mette nella cartella un file vecchio di prova prima della prima costruzione del router, e aspetta con un limite di tempo che sparisca.
- Se serve, `src/api/ebook_files.rs` può offrire un modo per sapere che la pulizia è finita. Il comportamento non cambia: una pulizia all'avvio, poi al massimo una all'ora per cartella.
- Un `sleep` fisso non basta come garanzia.

## Acceptance criteria
- `for i in $(seq 20); do cargo test -q -p bookeeper-core --test ebook_api -- --test-threads=32 || exit 1; done` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` e `cargo fmt --all -- --check` passano.
