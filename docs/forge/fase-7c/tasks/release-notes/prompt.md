Leggi prima `docs/forge/fase-7c/CONTRATTO.md`, `.github/workflows/release.yml` per intero, `scripts/update-manifest.mjs` con il suo test, `.github/workflows/ci.yml` e il `package.json` della radice. Leggi anche `apps/desktop/src/modules/updates/ReleaseNotes.tsx`, per sapere cosa sa mostrare l'app.

# Note di rilascio dal CHANGELOG

Oggi la release su GitHub usa le note generate da GitHub (`generate_release_notes: true`); per la beta sono comparse due volte. Il manifesto degli aggiornamenti porta solo un collegamento, così "Vedi novità" nell'app non mostra le novità.

## Cosa fare

1. **Script** `scripts/release-notes.mjs`, senza dipendenze, nello stile di `update-manifest.mjs`: `node scripts/release-notes.mjs --version 2.0.0 [--changelog CHANGELOG.md] [--out file]` scrive il corpo della sezione `## [2.0.0]` (titolo escluso, righe vuote in testa e in coda tolte) fino alla sezione successiva `## [`. Esce con errore e messaggio chiaro se la sezione manca o è vuota. Accetta il titolo con o senza data (`## [2.0.0]`, `## [2.0.0] - 2026-11-26`).
2. **Test** `scripts/release-notes.test.mjs` con `node:test`: sezione in mezzo, ultima sezione, titolo con e senza data, versione assente, sezione vuota, versioni con prefisso comune (`2.0.0` non prende `2.0.0-beta.1`).
3. **I test degli script in CI**: `npm run test:scripts` nella radice (`node --test scripts/`), e un passo nel job `js` di `ci.yml` che lo esegue. Con questo partono anche i test esistenti di `update-manifest`.
4. **`release.yml`**:
   - job `check`: quando si pubblica (`PUBLISH`), fallisce subito se il `CHANGELOG` non ha la sezione della versione;
   - job `release`: genera `release-notes.md` con lo script e lo usa come corpo (`body_path`), con `generate_release_notes: false`;
   - job `publish-updates`: il manifesto riceve le stesse note con `--notes-file`, al posto del collegamento.
   Nessun altro cambiamento al workflow.

## Acceptance criteria

- `node --test scripts/` passa.
- `release.yml` e `ci.yml` sono YAML validi (`python3 -c "import yaml; yaml.safe_load(open(...))"`).
- `node scripts/release-notes.mjs --version 2.0.0` sul `CHANGELOG.md` del ramo stampa la sezione.
- Cambiano solo: `scripts/release-notes.mjs`, `scripts/release-notes.test.mjs`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `package.json` della radice.
