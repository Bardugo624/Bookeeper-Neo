Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/d-polish-books/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# Desktop: libri, lettura, tag, etichette

## Ambito

Moduli `books`, `reading`, `tags`, `labels` del desktop.

Schermate: `/books` (griglia e tabella), `/books/:id`, pannello "Nuovo libro", pannello dei filtri, libreria vuota.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/desktop` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - **Decisione del proprietario**: il soprattitolo "NARRATIVA · 1980" della scheda passa sotto il titolo, nella riga dei metadati dopo l'autore, in testo normale (niente maiuscolo spaziato). Il titolo è il primo elemento della colonna.
   - Card dei libri: il nome accessibile non contiene il testo visibile (WCAG 2.5.3). Il nome comincia con il titolo, come si legge.
   - Pannello dei filtri ed etichette dei filtri attivi: gerarchia delle sezioni, allineamenti, stati selezionati nei due temi.
   - Colonna laterale della scheda (lettura, chi lo legge, tag, dove si trova): ritmo e spaziature tra i blocchi.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`, `reading/`, `tags/`, `labels/`, e i file i18n `books`, `reading`, `tags`, `labels` (it e en).
