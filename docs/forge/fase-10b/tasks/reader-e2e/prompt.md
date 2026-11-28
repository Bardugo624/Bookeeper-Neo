Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: la prova diventa un test in tre motori

## File
- Crea `packages/reader/e2e/`:
  - `make-epubs.mjs`, spostato da `scripts/reader-trial/`, e i due libri in `books/`;
  - `harness/`: una pagina che monta `reader-frame.html` con `Engine`, più la sua `vite.config.ts` con `foliateAssets()`;
  - `run.mjs`.
- `packages/reader/package.json`: lo script `test:e2e`.
- Se l'e2e mostra un difetto, puoi correggere `packages/reader/src/engine` e `packages/reader/src/frame`.
- Crea `.github/workflows/reader-e2e.yml`. Togli `.github/workflows/reader-trial.yml`, `scripts/reader-trial/` e `apps/mobile/public/prova-lettore/`.
- Aggiorna `scripts/workflows.test.mjs` se nomina i file tolti.

## Cosa fa `run.mjs`
- Costruisce la pagina di prova con Vite, la serve in locale e apre Playwright a 390×844 e a 1280×800.
- I motori sono quelli di `--browsers`; senza, tutti e tre.
- **Scenari:**
  1. **Velocità:** apre il libro grande e gira 100 pagine; il 95° percentile, fino a `relocate` più due fotogrammi, resta sotto i 100 ms.
  2. **Posizione:** al 40% cambia dimensione del carattere (18 → 22) e larghezza della finestra; la frazione resta entro lo 0,5% e la sezione è la stessa.
  3. **Ricerca:** cerca una parola frequente nel libro grande e intanto gira 20 pagine; il 95° percentile resta sotto i 100 ms; i risultati arrivano.
  4. **Libro ostile:** nessuno script parte in nessuna cornice; nessuna richiesta esce fuori dal server di prova, comprese quelle bloccate, che si contano dal testo di `requestfailed` come nella prova.
  5. **Chiusura:** `close()` non lascia errori nella pagina.
- Scrive `reader-e2e.json` ed esce con 1 se uno scenario fallisce.

## Il workflow
- Parte su `pull_request` e su `push` dei rami diversi da `main` che toccano `packages/reader/**`, `apps/*/reader-frame.html` o il workflow stesso, più `workflow_dispatch`.
- Rigenera i libri e controlla `git diff --exit-code`.
- Installa `playwright@1.63.0` in `$RUNNER_TEMP`, come la prova, con Chromium, WebKit e Firefox.
- Lancia il test e carica `reader-e2e.json`.
- Rispetta le regole di `scripts/workflows.test.mjs`.

## Passi
- [ ] Scrivi gli scenari, falli girare in locale con `--browsers chromium` e correggi finché passano.
- [ ] Il workflow gira nel ramo; riporta l'esito dei tre motori.

## Acceptance criteria
- `node packages/reader/e2e/run.mjs --browsers chromium` passa in locale.
- `npm run test:scripts` passa.
- Il workflow passa in CI nei tre motori; nel rapporto c'è il link alla run.
