Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# VPS: la chiave di Google Books arriva al server

## File
`ops/vps/deploy/docker-compose.yml`, `.github/workflows/vps-deploy.yml`, `scripts/workflows.test.mjs`.

## Cosa fare
- Il servizio `bookeeper` riceve `BOOKEEPER_GOOGLE_BOOKS_KEY: ${BOOKEEPER_GOOGLE_BOOKS_KEY:-}`.
- Il deploy con `target=server` scrive, prima di `deploy.sh`, il segreto `GOOGLE_BOOKS_API_KEY` in `/opt/bookeeper/.env` come `BOOKEEPER_GOOGLE_BOOKS_KEY=…`:
  - permessi 600;
  - il valore passa dallo stdin di `ssh`, mai nella riga di comando né nel log;
  - il repository è pubblico.
  Se il segreto è vuoto, il file resta con la variabile vuota.

## Test
- In `scripts/workflows.test.mjs`: `the_google_key_reaches_the_server_without_being_printed`.

## Acceptance criteria
- `node --test scripts/workflows.test.mjs` passa.
