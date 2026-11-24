Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Docker: immagine, compose, prova dal primo avvio all'abbinamento

## Obiettivo

Criterio d'uscita della fase 1: da `docker run` a libreria creata e dispositivo abbinato, senza file di configurazione (design §6.5). Qui nascono l'immagine, il file compose e lo script che lo prova.

## Cosa fare

1. **`Dockerfile`** alla radice, a più stadi. Le immagini di base sono argomenti sostituibili: `ARG NODE_IMAGE=node:22-alpine`, `ARG RUST_IMAGE=rust:1-alpine`, `ARG RUNTIME_IMAGE=gcr.io/distroless/static-debian12`.
   - Stadio web: `npm ci` e build di `@bookeeper/mobile` (produce `apps/mobile/dist`).
   - Stadio Rust: copia `apps/mobile/dist` dallo stadio web **prima** di compilare (il binario la incorpora), poi `cargo build --release --locked -p bookeeper-server`. Il binario è statico (musl).
   - Stadio finale: solo il binario in `/usr/local/bin/bookeeper-server` e una cartella `/data` vuota. `ENV BOOKEEPER_DATA=/data BOOKEEPER_MDNS=off` (in rete bridge il multicast non passa). `VOLUME /data`, `EXPOSE 7842`, `HEALTHCHECK` che esegue `bookeeper-server healthcheck` (forma exec: non c'è shell), `ENTRYPOINT` in forma exec.
   - Etichette OCI `org.opencontainers.image.title`, `.source`, `.licenses`.
   - Nessun segreto, nessun `ADD` da URL, nessun `curl | sh`.
2. **`.dockerignore`**: `target/`, `**/node_modules/`, `.git/`, `apps/*/dist/`, `docs/`, `site/`, `.forge/`, `.github/`. Verifica che `npm ci` nello stadio web trovi comunque i `package.json` dei workspace di cui ha bisogno.
3. **`docker-compose.yml`** alla radice: un servizio `bookeeper`, un volume con nome `bookeeper-data` su `/data`, una porta `7842:7842`, `restart: unless-stopped`, `image: ghcr.io/bardugo624/bookeeper-server:latest` e `build: .`. Un commento di tre righe in italiano in cima: come si avvia, dove si legge il codice di setup (`docker compose logs bookeeper`), quali variabili servono per un dominio (`BOOKEEPER_TLS`, `BOOKEEPER_DOMAIN`, `BOOKEEPER_PUBLIC_URL`).
4. **`scripts/smoke.sh <indirizzo> <codice-di-setup>`** (`bash`, `set -euo pipefail`, solo `curl` e `jq`). Passi, ognuno con una riga `ok: …` o un errore che nomina il passo ed esce con 1:
   1. `GET /api/v1/health` risponde `ok`;
   2. `GET /api/v1/server` risponde con `tls`;
   3. crea libreria e proprietario con il codice di setup;
   4. crea un libro e lo rilegge;
   5. genera un codice di abbinamento;
   6. lo riscatta come secondo dispositivo;
   7. il secondo dispositivo legge il libro;
   8. l'elenco dei dispositivi ne contiene due.
   Percorsi e corpi: dai contratti 1A e 1B e dal codice. Nessun token o codice stampato.
5. **`.github/workflows/ci.yml`**: job nuovo `docker` (ubuntu): build dell'immagine per amd64 senza pubblicarla, avvio del contenitore, attesa dello stato `healthy`, lettura del codice di setup da `docker logs`, `scripts/smoke.sh`. Aggiungi ai `paths` dei due inneschi: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/**`. Non toccare gli altri job.

## Verifica da fare davvero

- **Script**: avvia il server locale (`cargo run -p bookeeper-server -- --data-dir <tmp> --bind 127.0.0.1 --port <libera> --mdns off`), prendi il codice dall'uscita, esegui `scripts/smoke.sh`. DEVE finire con 0. Eseguilo una seconda volta con un codice sbagliato: DEVE fallire al passo 3 con 1.
- **Immagine**: se nell'ambiente c'è un demone Docker (`docker info`), costruisci l'immagine ed esegui lo script contro il contenitore. Dietro un proxy con una CA propria i contenitori di build possono non raggiungere la rete: gli argomenti `NODE_IMAGE` e `RUST_IMAGE` servono anche a passare immagini di base che la includono. Se non riesci a costruire, non inventare: scrivi nel rapporto che cosa hai eseguito e che cosa no.
- `docker compose config` accetta il file, se `docker compose` è disponibile.

## Acceptance criteria

- `bash -n scripts/smoke.sh` passa; lo script è eseguibile; la prova locale dei due casi è riportata nel rapporto con l'uscita.
- Il `Dockerfile` non contiene `latest` nei `FROM`, usa la forma exec per `ENTRYPOINT` e `HEALTHCHECK`, e copia `apps/mobile/dist` prima di `cargo build`.
- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('docker-compose.yml'))"` passa.
- I job esistenti di `ci.yml` sono identici a prima (`git diff` mostra solo aggiunte).
- Cambiano solo: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/smoke.sh`, `.github/workflows/ci.yml`.
