Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Mac: lo sfondo del DMG»). La bozza approvata è `docs/superpowers/specs/2026-11-27-setup-windows/dmg-sfondo.html`, con l'anteprima `12-dmg-anteprima.png`.

# Mac: lo sfondo del DMG

## File
- Crea `apps/desktop/src-tauri/dmg/background.html`: la sorgente, presa dalla bozza approvata, senza icone e senza segnaposto. Finder disegna le icone dell'app (centro in 180, 180) e di Applicazioni (480, 180), con le etichette sotto.
- Crea `apps/desktop/src-tauri/dmg/background.png` (660×400) e `apps/desktop/src-tauri/dmg/background@2x.png` (1320×800).
- Crea `scripts/setup/dmg-background.mjs` e `scripts/setup/dmg-background.test.mjs`.

## Cosa fare
- **`background.html`:**
  - collega `packages/ui/src/tokens.css` con un percorso relativo e usa i token del tema chiaro: niente colori letterali. Finder non conosce il tema dell'app, quindi l'immagine è sempre chiara;
  - i caratteri hanno `@font-face` propri, con percorsi relativi agli stessi file `woff2` in `node_modules/@fontsource-variable/`. `fonts.css` usa percorsi che risolve solo Vite. Niente richieste in rete.
- **`dmg-background.mjs`:**
  - apre `background.html` con Playwright (`require('playwright')`, già installato sulla macchina; NON aggiungerlo alle dipendenze);
  - salva le due immagini con `deviceScaleFactor` 1 e 2;
  - si lancia a mano, quando lo sfondo cambia: `node scripts/setup/dmg-background.mjs`.
- **Provenienza:** dopo averle generate, scrivi l'origine nelle due PNG con `impeccable embed-prompt` (la cartella dello skill è `.claude/skills/impeccable/`). Origine: «disegnata da `apps/desktop/src-tauri/dmg/background.html` con `scripts/setup/dmg-background.mjs`». Poi `impeccable embed-prompt --scan apps/desktop/src-tauri/dmg` NON DEVE segnalare nulla.

## Test (`node --test scripts/setup/dmg-background.test.mjs`)
- Le due PNG esistono e misurano 660×400 e 1320×800: legge l'intestazione PNG, senza dipendenze.
- `background.html` non carica nulla da internet (nessun `http` in `src` o `href`).
- Lo sfondo lascia libere le zone delle icone: nessun elemento visibile della sorgente si sovrappone ai riquadri 128×128 centrati in (180, 180) e (480, 180), né alle etichette sotto. È un controllo statico sulle posizioni dichiarate.

## Acceptance criteria
- `node --test scripts/setup/dmg-background.test.mjs` passa.
- Le immagini combaciano con `12-dmg-anteprima.png`, tolte le icone e le etichette.
- Cambiano solo i file dichiarati.
