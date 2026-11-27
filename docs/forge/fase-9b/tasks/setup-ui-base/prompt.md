Leggi prima `docs/forge/fase-9b/CONTRATTO.md` («Chiavi dei testi», «Regole») e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Citazioni», «Interfaccia»).

# Setup: i testi, le icone e la barra del kit, le citazioni

## File
- Crea `packages/i18n/src/locales/it/setup.json` e `packages/i18n/src/locales/en/setup.json`: tutte le chiavi del contratto, con i testi italiani esatti. L'inglese ha lo stesso tono: frasi brevi, seconda persona, niente gergo.
- Modifica `packages/ui/src/base/Icon.tsx` e `Icon.test.tsx`: icone `folder` (`FolderOpen`), `power` (`Power`), `chevron-up` (`ChevronUp`).
- Modifica `packages/ui/src/book/FillBar.tsx` e `FillBar.test.tsx`: proprietà facoltativa `valueText?: string`, resa come `aria-valuetext` sull'elemento con `role="progressbar"`.
- Crea `scripts/setup/quotes.mjs`, `scripts/setup/quotes.test.mjs` e il file generato `apps/setup/src/quotes.json`.

## Interfacce prodotte
- Lo spazio di nomi `setup` in `@bookeeper/i18n`: le task dell'interfaccia usano solo queste chiavi.
- `Icon` con i tre nomi nuovi; `FillBar` con `valueText`.
- `apps/setup/src/quotes.json`: `[{ id, author, work, it, en }]`. `it` ed `en` sono i testi; `work` è l'opera fino alla prima ` (`.

## Cosa fare
- **`quotes.mjs`:**
  - legge `docs/citazioni/citazioni.json` e `docs/citazioni/scelte.json`, e prende solo le citazioni con la scelta `tieni`;
  - esclude un testo oltre i 200 caratteri in quella lingua; se restano senza testo entrambe le lingue, esclude la citazione;
  - scrive il file in ordine di `id`, con a capo `\n`;
  - si lancia con `node scripts/setup/quotes.mjs`.
- **Testi:** i segnaposto `{version}`, `{size}`, `{need}`, `{free}`, `{drive}`, `{installed}`, `{dir}`, `{step}` e `{percent}` sono gli stessi nelle due lingue.

## Test
- **`node --test scripts/setup/quotes.test.mjs`**, con file di prova in una cartella temporanea:
  - solo le citazioni `tieni`;
  - opera tagliata alla prima parentesi;
  - esclusione oltre i 200 caratteri;
  - il file generato oggi coincide con quello nel repository.
- **`packages/ui`:** le tre icone si disegnano; `FillBar` con `valueText` espone `aria-valuetext`, e senza non lo espone.
- **`packages/i18n`:** il test esistente sulle chiavi uguali fra `it` ed `en` passa anche con `setup`. Un test nuovo controlla che i segnaposto di ogni chiave coincidano fra le due lingue.

## Acceptance criteria
- `npm test -w @bookeeper/ui`, `npm test -w @bookeeper/i18n` e `node --test scripts/setup/quotes.test.mjs` passano.
- Cambiano solo i file dichiarati.
