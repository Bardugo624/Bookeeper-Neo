Leggi prima `docs/forge/fase-7a/CONTRATTO.md`.

# Rimozione della 0.3

## Cosa fare

1. Elimina gli alberi della 0.3: `server/`, `clients/`, `deploy/`, più `site/` (pagina prezzi: la 2.0 non ha monetizzazione), `header.bmp` e `wizard.bmp` (immagini dell'installatore 0.3) e `.github/workflows/deploy-server.yml` (deploy della 0.3, già solo manuale).
2. Cerca in tutto il repository i riferimenti a ciò che hai eliminato (configurazione dei workspace npm e Cargo, `.gitignore`, `.dockerignore`, script, workflow, README) e toglili o aggiornali. Fanno eccezione `docs/forge/`, `docs/superpowers/` e `CHANGELOG.md`, che sono storia.
3. Non toccare `ops/`, `apps/`, `crates/`, `packages/`.

## Acceptance criteria

- `git grep -nE '(^|[^-a-z])(clients|server|deploy|site)/' -- ':!docs/forge' ':!docs/superpowers' ':!CHANGELOG.md' ':!node_modules'` non trova riferimenti ai percorsi eliminati (i percorsi della 2.0 come `crates/bookeeper-server/` o `ops/vps/deploy/` restano). Elenca nel rapporto ciò che resta e perché.
- `cargo build --workspace` e `cargo test --workspace` passano.
- `npm ci` dalla radice, `npm test --workspaces --if-present` e `npm run build -w @bookeeper/desktop -w @bookeeper/mobile` passano.
- Ogni file in `.github/workflows/` è YAML valido.
- Cambiano solo file eliminati e i file che li citavano. Elencali nel rapporto.
