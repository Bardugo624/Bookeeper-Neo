Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Libri e tag: niente zona fissa, il rosso nella conferma

1. **Scheda del libro**: togli la `DangerZone` in fondo alla pagina. «Elimina» torna nel menu «Altro» della barra (`DetailToolbar.tsx`), come nella 2.0.0; il kit la mette in fondo dopo un divisore. Premendola si apre la conferma con `tone="danger"`, con la conseguenza scritta nel run 8A (copertina, posto sullo scaffale, prestiti, stati di lettura, tag, non si annulla).
2. **Selezione di più libri** (`SelectionBar.tsx`): «Elimina» è un bottone normale, non rosso; la conferma resta rossa, con la conseguenza allineata a quella del libro singolo.
3. **Tag** (`modules/tags/ManageTagsDialog.tsx`): il comando di eliminazione di un tag torna neutro, come nella 2.0.0; la conferma è rossa e dice la conseguenza.
4. Togli i testi rimasti senza uso in `books.json` e `tags.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books src/modules/tags src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test: nessuna zona nella scheda; «Elimina» nel menu «Altro», ultima; la conferma ha il tono e la conseguenza; un ospite non vede nulla di tutto questo.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`, `apps/desktop/src/modules/tags/`, e `books.json`, `tags.json` (it, en).
