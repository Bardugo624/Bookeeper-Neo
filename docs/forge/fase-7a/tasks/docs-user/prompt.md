Leggi prima `docs/forge/fase-7a/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`. Leggi `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `docker-compose.yml`, `Dockerfile`, `crates/bookeeper-server/src/config.rs`, `ops/vps/deploy/` (esempio reale dietro Caddy) e `.github/workflows/release.yml`.

# Documentazione della 2.0

Tutto in italiano, frasi brevi. Ogni comando l'hai eseguito; ogni opzione esiste in `bookeeper-server --help`.

## Cosa fare

1. **`README.md`**: cos'è Bookeeper 2.0, le tre parti (app desktop, server, PWA sul telefono), come installarle (installatori dalla pagina delle release; server con Docker o binario), dove sono i documenti. Breve.
2. **`docs/deploy.md`** (nuovo): mettere il server in rete.
   - Docker con `docker compose`: le tre modalità TLS (`off` dietro un proxy, `acme` con dominio, `self`), le variabili `BOOKEEPER_*`, volume e backup.
   - Binario: avvio, cartella dati, `--help`, servizio di sistema (unità `systemd` d'esempio).
   - Dietro un proxy (Caddy, con l'esempio di `ops/vps/deploy/`).
   - Il telefono richiede HTTPS valido (D7): cosa vuol dire in pratica.
   - Primo avvio: codice di setup, creare la libreria, aggiungere dispositivi e persone.
   - Aggiornare il server; backup e ripristino.
3. **`ROADMAP.md`**: riscritto per la 2.x. Cosa c'è nella 2.0 (riassunto per blocchi), cosa arriva nella 2.1 (notifiche push sulla PWA, eliminazione della libreria) e le idee senza data. Niente monetizzazione (decisione D4).
4. **`CHANGELOG.md`**: nuova sezione `2.0.0` in testa, nel formato che il file già usa, con le novità per blocchi. L'introduzione del file parla dell'app desktop 0.3: aggiornala alla 2.0 senza toccare le sezioni delle versioni passate.

## Acceptance criteria

- Ogni comando di `docs/deploy.md` è stato eseguito (quelli Docker solo se `docker` è disponibile: altrimenti dillo nel rapporto, comando per comando).
- Ogni percorso e ogni link relativo citato esiste.
- Cambiano solo `README.md`, `ROADMAP.md`, `CHANGELOG.md` e `docs/deploy.md`.
