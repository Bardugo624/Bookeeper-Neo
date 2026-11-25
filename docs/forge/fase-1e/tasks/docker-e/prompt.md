Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Docker: toolchain, porta 443, esempio con dominio

## Obiettivo

Correggere tre difetti trovati costruendo e provando l'immagine del run 1D.

## Cosa fare

1. **Una sola toolchain Rust nella build.** `rust-toolchain.toml` chiede `stable` con `rustfmt` e `clippy`. Dentro l'immagine `rust:1-alpine` questo fa scaricare a `rustup` una seconda toolchain a ogni build. Aggiungi `rust-toolchain.toml` a `.dockerignore`: la build usa il compilatore dell'immagine.
2. **Porta 443 dichiarata.** In `Dockerfile`: `EXPOSE 7842 443`. Con `BOOKEEPER_TLS=acme` il server ascolta sulla 443.
3. **Esempio con dominio in `docker-compose.yml`.** Il servizio attivo resta com'è: un servizio, un volume, una porta. Sotto, un blocco commentato mostra la variante con HTTPS automatico:
   - `BOOKEEPER_TLS: acme`
   - `BOOKEEPER_DOMAIN: libri.example.org` con la nota che accetta più nomi separati da virgola e che il primo è l'indirizzo dato ai telefoni
   - `BOOKEEPER_ACME_EMAIL: tu@example.org`
   - `ports: ["443:443"]` al posto di `7842:7842`
   - la nota che la porta 443 DEVE essere raggiungibile da Internet e ogni nome DEVE puntare a questa macchina.
   Commenti in italiano, come quelli già presenti. Aggiorna la riga di commento in testa che oggi cita `BOOKEEPER_PUBLIC_URL`.

Non modificare `scripts/smoke.sh`, `.github/workflows/` né le fasi del `Dockerfile`.

## Acceptance criteria

- `grep -qx 'rust-toolchain.toml' .dockerignore` riesce.
- `grep -q '^EXPOSE 7842 443$' Dockerfile` riesce.
- `docker compose -f docker-compose.yml config` riesce se `docker compose` è disponibile; altrimenti il file è YAML valido (`python3 -c "import yaml,sys; yaml.safe_load(open('docker-compose.yml'))"`).
- Il file compose, tolti i commenti, ha ancora un solo servizio, un solo volume e una sola porta.
- Cambiano solo: `Dockerfile`, `.dockerignore`, `docker-compose.yml`.
- Non eseguire `docker build`: la verifica dell'immagine la fa chi lancia il run.
