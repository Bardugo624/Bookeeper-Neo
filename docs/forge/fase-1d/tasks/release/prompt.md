Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Workflow di rilascio: binari del server e immagine Docker

## Obiettivo

Un tag `v2.*` produce i binari statici di `bookeeper-server` e l'immagine Docker multi-architettura (design §6.5). Installer desktop e manifest di aggiornamento arrivano con la fase 2: qui non si fanno, ma il workflow è fatto in modo che aggiungere un job non richieda di rifarlo.

## Cosa fare

Un solo file: `.github/workflows/release.yml`.

- **Inneschi**: `push` di tag `v2.*`; `workflow_dispatch` con un ingresso booleano `publish` (predefinito `false`): senza `publish` il workflow compila tutto e carica gli artefatti del run, ma non crea il rilascio e non pubblica l'immagine.
- **Permessi**: in cima `contents: read`. Solo il job che crea il rilascio ha `contents: write`; solo quello dell'immagine ha `packages: write`.
- **Job `check`**: il tag DEVE essere `v` + la versione del workspace in `Cargo.toml`; altrimenti fallisce con un messaggio chiaro. Espone la versione come uscita. Con `workflow_dispatch` usa la versione del workspace.
- **Job `web`**: `npm ci`, build di `@bookeeper/mobile`, carica `apps/mobile/dist` come artefatto. Ogni job che compila il server lo scarica in `apps/mobile/dist` **prima** di `cargo build`: un binario di rilascio con la pagina segnaposto è un difetto.
- **Job `server`** (matrice):

  | Nome | Runner | Target | Come |
  | --- | --- | --- | --- |
  | `linux-amd64` | ubuntu | `x86_64-unknown-linux-musl` | `cargo zigbuild` |
  | `linux-arm64` | ubuntu | `aarch64-unknown-linux-musl` | `cargo zigbuild` |
  | `windows-amd64` | windows | `x86_64-pc-windows-msvc` | `cargo build`, runtime C statico (`-C target-feature=+crt-static`) |
  | `macos-arm64` | macos | `aarch64-apple-darwin` | `cargo build` |
  | `macos-amd64` | macos | `x86_64-apple-darwin` | `cargo build` |

  Sempre `--release --locked -p bookeeper-server`. Archivio per voce: `bookeeper-server-<versione>-<nome>.tar.gz` (`.zip` su Windows) con il binario e `LICENSE`. Sul target eseguibile dal runner, un passo avvia `bookeeper-server --version` e verifica che stampi la versione.
- **Job `docker`**: QEMU e Buildx, `linux/amd64,linux/arm64`, dal `Dockerfile` alla radice, su `ghcr.io/<proprietario in minuscolo>/bookeeper-server`. Etichette e tag da `docker/metadata-action` (versione completa; `major.minor` e `major` solo se non è una pre-release). Cache `type=gha`. Pubblica solo su tag o con `publish`.
- **Job `release`**: dopo `server` e `docker`. Scarica gli archivi, genera `SHA256SUMS`, crea il rilascio GitHub con note generate. `prerelease: true` se la versione contiene `-`.
- Azioni di terzi fissate alla versione maggiore, come in `ci.yml`. Nessun segreto oltre `GITHUB_TOKEN`. `concurrency` per tag, senza annullare un rilascio in corso.
- Non toccare `ci.yml` né `deploy-server.yml`.

## Verifica da fare davvero

I workflow non girano in questo ambiente: si provano i comandi.

1. Installa `cargo-zigbuild` e `zig` (per esempio `pip install ziglang` e `cargo install --locked cargo-zigbuild`).
2. Costruisci `apps/mobile/dist` e poi il target `x86_64-unknown-linux-musl` con il comando esatto scritto nel workflow. `file` sul binario dice `statically linked`. Avvialo su una porta libera con una cartella dati temporanea e `--mdns off`: `GET /api/v1/health` risponde, e `GET /` restituisce la pagina vera, non il segnaposto.
3. Costruisci anche `aarch64-unknown-linux-musl` con lo stesso comando. `file` dice `ARM aarch64` e `statically linked`.
4. Se uno dei due non compila, il difetto è reale: correggi il comando nel workflow, non il codice. Se la correzione richiede di toccare altri file, fermati e dillo.
5. Scrivi nel rapporto i comandi eseguiti e il loro esito. Ciò che non hai potuto provare (Windows, macOS, pubblicazione) va detto.

## Acceptance criteria

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"` passa. Se `actionlint` è installabile, passa anche quello.
- I due target Linux compilano qui con i comandi del workflow; l'esito è nel rapporto.
- Nessun job pubblica senza tag o senza `publish`.
- Ogni job che compila il server dipende da `web` e scarica l'artefatto prima di compilare.
- Cambia solo `.github/workflows/release.yml`.
