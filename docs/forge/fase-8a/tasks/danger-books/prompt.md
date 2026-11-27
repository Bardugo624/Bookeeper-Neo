Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone`, `kit-danger-tones`, le task del pop-up dei libri e quelle del tour.

# Desktop: zona pericolosa in libri e tag

## Cosa

Applica la regola della zona pericolosa a libri e tag. Setup di Impeccable da `apps/desktop` con `--target src/modules/books`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Scheda del libro**: «Elimina libro» esce dal menu «Altro» della barra (`DetailToolbar.tsx`) e va in una `DangerZone` in fondo alla pagina del libro. Conseguenza: verifica nel core cosa si cancella insieme al libro (posto sullo scaffale, prestiti, stati di lettura, tag) e scrivi quello.
2. **Selezione di più libri** (`SelectionBar.tsx`): «Elimina» staccato dalle altre azioni, rosso; la conferma col tono `danger`.
3. **Tag** (`modules/tags/ManageTagsDialog.tsx`): l'eliminazione di un tag usa `tone="danger"`; la conferma col tono.
4. Le conferme di eliminazione passano da `ConfirmDialog` con `tone="danger"`.
5. Testi: «Zona pericolosa» e le conseguenze in `books.json` e `tags.json` (italiano e inglese).

## Test

- «Elimina libro» non è più nel menu «Altro» ed è nella zona in fondo alla pagina, con il suo nome; funziona come prima; un ospite non vede la zona.
- «Elimina» della selezione è staccato e pericoloso; l'eliminazione dei tag ha il tono; le conferme hanno il tono `danger`.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/kit/styles.test.ts` (da `apps/desktop`) passa: i fogli di stile usano solo token esistenti; `npx vitest run src/modules/books src/modules/tags` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`, `tags/`, e `books.json`, `tags.json` (it, en).
