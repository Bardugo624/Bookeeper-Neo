Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano. La task `bk-version` è già unita: usa `readVersion` di `scripts/bk/version.mjs` e `compare` di `scripts/semver.mjs`.

# Lo script `bk`: base, menu e comandi di consultazione

## File

- Crea:
  - `scripts/bk.mjs`: l'ingresso;
  - `scripts/bk/errors.mjs`, `scripts/bk/gh.mjs`, `scripts/bk/git.mjs`, `scripts/bk/public.mjs`, `scripts/bk/menu.mjs`;
  - `scripts/bk/commands/status.mjs`, `ci.mjs`, `dist.mjs`, `doctor.mjs`;
  - i test `scripts/bk/*.test.mjs`, e `scripts/bk/fake-gh.mjs`: un `gh` finto che registra gli argomenti e risponde da uno scenario JSON;
  - `docs/bk.md`: la guida d'uso, in italiano.
- Modifica `package.json` alla radice (lo script `"bk": "node scripts/bk.mjs"`) e `.gitignore` (`/dist/`).

## Interfacce prodotte

- **`errors.mjs`:** `class BkError extends Error { constructor(message, hint?) }`. L'ingresso stampa `✗ <message>`, e `→ <hint>` se c'è, poi esce con 1. Una traccia dello stack compare solo con `BK_DEBUG=1`.
- **`gh.mjs`:**
  - `gh(args: string[], { json?: boolean } = {})`: usa `spawnSync('gh', args, { encoding: 'utf8', shell: false })`; con `json: true` restituisce l'output già letto come JSON.
  - Se `gh` manca: `BkError('gh non è installato', 'Installa GitHub CLI: https://cli.github.com')`.
  - Se non è collegato: `BkError('gh non è collegato a GitHub', 'Esegui: gh auth login')`.
  - `findRun(workflow, ref, since: Date) → { id, url, status, conclusion }`: il primo run creato dopo `since`, letto con `gh run list --workflow <wf> --branch <ref> --limit 10 --json databaseId,createdAt,status,conclusion,url`. Riprova per al massimo 60 s.
  - `watch(id)`: `gh run watch <id> --exit-status`; restituisce `true` o `false`.
- **`git.mjs`:** `branch()`, `isClean(allow?: string[])`, `isPushed()` (fa `fetch` di quel ramo e confronta `HEAD` con `origin/<ramo>`), `shortSha()`, `commit(paths, message)`, `push()`. Usa sempre `spawnSync('git', …, { shell: false })`.
- **`public.mjs`:**
  - `channelVersions() → { stable, beta, source: 'r2' | 'vps' }`: legge `https://updates.neokeeper.dev/v2/<canale>/latest.json`; se non risponde, legge la VPS (`https://app.neokeeper.dev/updates/<canale>/latest.json`).
  - `serverVersion()`: legge `https://app.neokeeper.dev/api/v1/server`; guarda il tipo della risposta in `packages/api` per il nome del campo.
  - Ogni richiesta ha un timeout di 10 s.
  - Per i test, le basi si possono cambiare con `BK_UPDATES_BASE`, `BK_VPS_BASE` e `BK_SERVER_URL`.
- **`menu.mjs`:** `choose(title, items: {key,label}[]) → key`, un menu numerato con `node:readline`; `confirm(question, word?) → boolean`, dove con `word` bisogna scrivere proprio quella parola.
- **`bk.mjs`:**
  - `npm run bk` senza argomenti apre il menu dei comandi registrati;
  - `npm run bk -- <comando> [argomenti]` esegue subito il comando;
  - `help` elenca i comandi.
  - Ogni comando è un modulo `commands/<nome>.mjs` che esporta `meta = { name, summary }` e `run(args)`. La task `bk-publish` ne aggiungerà altri al registro.

## Comandi

| Comando | Cosa fa |
|---|---|
| `status` | Ramo, ultimo commit, se è su GitHub, versione del repository (`readVersion`). Gli ultimi run di `ci.yml`, `release.yml` e `vps-deploy.yml` (`gh run list --workflow <wf> --limit 3`). Le versioni dei canali, con la loro fonte. La versione del server. |
| `ci` | Gli ultimi 10 run del ramo. `ci run` avvia `gh workflow run ci.yml --ref <ramo>`: il ramo deve essere già su GitHub. Poi trova il run e lo segue. `ci watch [id]` (senza id: l'ultimo del ramo), `ci logs [id]` (`gh run view <id> --log-failed`), `ci rerun [id]` (`gh run rerun <id> --failed`). |
| `dist [versione]` | I link degli installer. Li prende da `https://updates.neokeeper.dev/v2/downloads/<canale>.json`; se non risponde, da `gh release view v<versione> --json assets`. Senza versione usa l'ultima stabile. Con `--download`: `gh release download v<versione> -D dist/<versione> -p "Bookeeper_*"`. |
| `doctor` | Node ≥ 20; `git`; `gh` installato e collegato (`gh auth status`); accesso al repository (`gh repo view --json nameWithOwner`); albero pulito; `node_modules` presente. Ogni voce è segnata ✓ o ✗, con la soluzione. |

## Passi

- [ ] Test, prima del codice. Per `gh` usa `fake-gh.mjs` sul `PATH` (un file eseguibile `gh` che lo lancia); per `git`, un repository temporaneo con un remote locale; per `public.mjs`, un server HTTP locale.
  - `gh` assente: il messaggio di installazione, codice 1, nessuno stack.
  - `gh` non collegato: «gh auth login».
  - `findRun` sceglie il run giusto per data.
  - `status` mostra la versione, i canali, la fonte e il server.
  - `channelVersions` passa alla VPS quando R2 non risponde.
  - `ci run` su un ramo non spinto si ferma.
  - `dist` usa l'indice; senza indice usa la release.
  - `doctor` segnala `gh` mancante.
  - Il menu con l'input `2\n` sceglie il secondo comando.
- [ ] Verifica che falliscano, scrivi il codice e verifica che passino.
- [ ] Scrivi `docs/bk.md`: come installare `gh` (Windows: `winget install GitHub.cli`), `gh auth login`, `npm ci`, ogni comando con un esempio.

## Acceptance criteria

- `npm run test:scripts` passa.
- `node scripts/bk.mjs help` stampa l'elenco.
- Cambiano solo i file dichiarati.
