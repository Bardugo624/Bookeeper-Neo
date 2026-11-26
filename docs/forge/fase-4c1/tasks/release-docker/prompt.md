Leggi `.github/workflows/release.yml`, `Dockerfile`, `.dockerignore` e `docs/forge/fase-2c/CONTRATTO.md` (sezione sulla release) prima di scrivere.

# Release: immagine Docker dai binari già compilati

## Problema

Il job `docker` di `release.yml` costruisce `linux/amd64` e `linux/arm64` dal `Dockerfile`, che compila Rust dentro l'immagine. La parte arm64 gira sotto QEMU: alla prima release ha superato un'ora e tre quarti. I job `server (linux-amd64)` e `server (linux-arm64)` producono già, in pochi minuti, i binari musl statici che servono.

## Cosa fare

1. **`Dockerfile.release`** nuovo, senza compilazione: stessa immagine finale del `Dockerfile` (stessa base distroless, stesse `LABEL`, `ENV`, `VOLUME`, `EXPOSE`, `HEALTHCHECK`, `ENTRYPOINT`, cartella `/data` presente). Prende il binario da un contesto preparato dal workflow: `COPY bin/${TARGETARCH}/bookeeper-server /usr/local/bin/bookeeper-server` con `ARG TARGETARCH`. La cartella `/data` vuota si crea senza eseguire comandi nell'immagine finale (distroless non ha shell): copiala dal contesto.
2. **Job `server`**: i due job Linux caricano anche il binario nudo come artefatto (`server-bin-linux-amd64`, `server-bin-linux-arm64`), oltre all'archivio.
3. **Job `docker`**: `needs: [check, server]`. Scarica i due artefatti in `docker-context/bin/amd64/` e `docker-context/bin/arm64/`, rende eseguibili i binari (`chmod +x`: gli artefatti perdono il bit), crea `docker-context/data/` con un file `.keep`, e costruisce con `context: docker-context`, `file: Dockerfile.release`, stesse piattaforme, stessi tag, stesse etichette, stessa regola `push`. `setup-qemu-action` resta: serve solo ad assemblare l'immagine arm64, nessun `RUN` viene eseguito. Togli la cache `type=gha` della build: non c'è più nulla da compilare.
4. Prima del push, un passo verifica l'immagine amd64: la costruisce con `load: true` per `linux/amd64` e controlla che `docker run --rm <immagine> --version` stampi la versione della release.
5. Il `Dockerfile` esistente non cambia: resta la via per chi costruisce da sorgente con `docker compose`.
6. Commenti nel workflow solo dove spiegano un perché (il bit eseguibile perso, QEMU senza `RUN`).

## Acceptance criteria

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"` riesce.
- `Dockerfile.release` non contiene `RUN` né `cargo`.
- Le righe `LABEL`, `ENV`, `VOLUME`, `EXPOSE`, `HEALTHCHECK`, `ENTRYPOINT` di `Dockerfile.release` sono uguali a quelle della fase finale del `Dockerfile`.
- Se `docker` è disponibile: con un binario musl amd64 costruito in locale (`cargo build --release -p bookeeper-server --target x86_64-unknown-linux-musl`, se il target è installato) messo in un contesto di prova, `docker build -f Dockerfile.release` riesce e `--version` risponde. Se manca `docker` o il target, dillo nel rapporto e non inventare l'esito.
- Gli altri job del workflow non cambiano, a parte il passo di caricamento aggiunto ai due job Linux di `server`.
- Cambiano solo: `.github/workflows/release.yml`, `Dockerfile.release`.
