Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano.

# Versioni: calcolo e cambio in tutti i posti

## File

- Crea `scripts/semver.mjs` e `scripts/semver.test.mjs`.
- Crea `scripts/bk/version.mjs` e `scripts/bk/version.test.mjs`.

## Interfacce prodotte

- `scripts/semver.mjs`:
  - `parse(v: string) → { major, minor, patch, pre: Array<string|number> }`. Accetta SemVer 2.0.0 senza `v` iniziale e senza metadati `+`; lancia un errore su tutto il resto.
  - `compare(a, b) → -1 | 0 | 1`, con la precedenza di SemVer 2.0.0: i numeri si confrontano come numeri, e una versione con suffisso viene prima di quella senza.
  - `isPrerelease(v) → boolean`.
  - `inc(v, kind) → string`, con `kind` in `patch | minor | major | beta`. Le regole sono quelle di `semver.inc` di npm, con le beta che partono da `.1`:
    - da una stabile: `patch`, `minor` e `major` come di consueto; `beta` dà la minore successiva (`X.(Y+1).0-beta.1`);
    - da `X.Y.Z-beta.N`: `beta` dà `X.Y.Z-beta.(N+1)`; `patch` dà `X.Y.Z`; `minor` dà `X.Y.0` se `Z` è 0, altrimenti `X.(Y+1).0`; `major` dà `X.0.0` se `Y` e `Z` sono 0, altrimenti `(X+1).0.0`;
    - `beta` su un suffisso diverso da `beta.N` lancia un errore.
- `scripts/bk/version.mjs`:
  - `readVersion(root) → string`: legge la versione di `[workspace.package]` in `Cargo.toml`.
  - `bumpVersion(root, to) → string[]`: cambia la versione in tutti i posti, conservando formato e a capo di ciascun file, e restituisce i percorsi relativi cambiati. I posti sono:
    - `Cargo.toml` (`[workspace.package] version`);
    - `Cargo.lock`, solo i blocchi `[[package]]` senza riga `source`, cioè le crate del workspace. Oggi sono `bookeeper-core`, `bookeeper-desktop`, `bookeeper-net` e `bookeeper-server`. Una crate esterna con lo stesso numero, come `async-net`, NON si tocca;
    - `apps/desktop/src-tauri/tauri.conf.json` (il `version` di primo livello);
    - i `package.json` di `packages/ui`, `packages/api`, `packages/i18n`, `apps/desktop` e `apps/mobile` (il `version` di primo livello);
    - `package-lock.json`: il `version` delle voci `packages["packages/ui"]`, `["packages/api"]`, `["packages/i18n"]`, `["apps/desktop"]` e `["apps/mobile"]`;
    - `packages/api/openapi.json` (`info.version`).

    Prima di scrivere qualunque file, controlla che ogni posto contenga la versione di `readVersion(root)`. Altrimenti lancia un errore che elenca i file in disaccordo, e non scrive nulla.
  - `ensureChangelog(root, version, date) → { existed: boolean }`. Se `CHANGELOG.md` non ha `## [<version>]`, inserisce prima del primo `## [` questa sezione e restituisce `existed: false`:

    ```
    ## [<version>] - <date>

    ### Added

    -
    ```

    Altrimenti non tocca nulla. Conserva gli a capo del file.

## Passi

- [ ] Test di `semver.test.mjs`, prima del codice:
  - `inc('2.1.0','patch') === '2.1.1'`, `inc('2.1.0','minor') === '2.2.0'`, `inc('2.1.0','major') === '3.0.0'`, `inc('2.1.0','beta') === '2.2.0-beta.1'`;
  - `inc('2.2.0-beta.1','beta') === '2.2.0-beta.2'`, `inc('2.2.0-beta.3','patch') === '2.2.0'`, `inc('2.2.0-beta.3','minor') === '2.2.0'`, `inc('2.2.1-beta.1','minor') === '2.3.0'`, `inc('2.2.0-beta.3','major') === '3.0.0'`, `inc('3.0.0-beta.2','major') === '3.0.0'`;
  - `compare('2.2.0-beta.1','2.2.0') === -1`, `compare('2.2.0-beta.10','2.2.0-beta.9') === 1`, `compare('2.10.0','2.9.0') === 1`, `compare('2.1.0','2.1.0') === 0`;
  - `parse('v2.1.0')` e `parse('2.1')` lanciano; `inc('2.2.0-rc.1','beta')` lancia.
- [ ] Verifica che falliscano, poi scrivi `semver.mjs` e verifica che passino.
- [ ] Test di `version.test.mjs`, su una copia temporanea dei file veri del repository (ricopiati nella stessa struttura):
  - dopo `bumpVersion(tmp, '9.9.9')` ogni posto mostra `9.9.9`;
  - ogni riga cambiata conteneva la versione di partenza;
  - la voce di `async-net` in `Cargo.lock` non cambia;
  - il valore restituito elenca i file cambiati;
  - una copia con a capo `\r\n` resta con `\r\n`;
  - se `tauri.conf.json` ha un'altra versione, l'errore lo nomina e nessun file cambia;
  - `ensureChangelog` aggiunge la sezione una sola volta (la seconda chiamata restituisce `existed: true`) e conserva i `\r\n`.
- [ ] Verifica che falliscano, poi scrivi `version.mjs` e verifica che passino.

## Acceptance criteria

- `node --test scripts/semver.test.mjs scripts/bk/version.test.mjs` passa; `npm run test:scripts` passa.
- Cambiano solo i quattro file dichiarati.
