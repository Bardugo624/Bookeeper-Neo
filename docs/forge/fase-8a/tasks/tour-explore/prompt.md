Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Il tour»), `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`. Sono già unite `tour-core`, `tour-start` e `tour-place-pair`: il percorso `firstBook` è completo e parte per chi può scrivere ed entra in una libreria vuota.

# Desktop: il tour per chi trova già i libri, e «Rivedi il tutorial»

## Cosa

Le persone nuove che entrano in una libreria **già piena**, e gli **ospiti** (che non aggiungono libri), ricevono un percorso diverso, `explore`: non aggiungere, ma trovare. Inoltre il tour si rivede dalle Impostazioni. Setup di Impeccable da `apps/desktop` con `--target src/modules/tour`; leggi `reference/onboard.md`, `reference/overdrive.md` e `reference/craft-floor.md`.

## Il percorso `explore`

Parte dove `tour-start` oggi lascia il segno «persona nuova» senza far partire nulla: persona nuova che non può scrivere, o libreria con libri. Il segno si cancella.

1. **«Trova un libro»**: riflettore su «Cerca e comandi» nella barra (ancora `nav.search`): «Scrivi un titolo o un autore». Si completa con il segnale `book-opened`, quando si apre la pagina di un libro (dalla ricerca, dalla palette o dall'elenco).
2. **«Dov'è?»**: nella pagina del libro, riflettore su «Dov'è?» (ancora `book.where`): «Ti mostra il mobile e il ripiano». Si completa con il segnale `where-shown`, quando la posizione viene mostrata. Se il libro non è collocato, la scheda lo dice e il passo si completa lo stesso.
3. **«Segna cosa leggi»**: solo se la persona può segnare il proprio stato di lettura (come già decide il modulo `reading`); riflettore sul blocco della lettura (ancora `book.reading`). Si completa con il segnale `reading-changed`. Per chi non può, il percorso ha 2 passi.{{EXPLORE}}

## «Rivedi il tutorial»

Nelle Impostazioni, nella sezione della libreria o del dispositivo, un'azione «Rivedi il tutorial» (bottone secondario, con una riga che spiega cosa fa). Riparte dal primo passo con il percorso adatto adesso: `firstBook` se la persona può scrivere e la libreria è vuota, altrimenti `explore`. Funziona anche dopo «Salta il tutorial».{{SETTINGS}}

## Testi

Nel namespace `tour` (italiano e inglese): titoli e testi dei passi di `explore`, l'azione e la riga di «Rivedi il tutorial».

## Test

- Persona nuova in una libreria con libri, o ospite: parte `explore` e il segno sparisce.
- I tre passi seguono i loro bersagli e si completano con `book-opened`, `where-shown`, `reading-changed`; i segnali partono dalle azioni reali; il libro non collocato completa il passo 2.
- Senza il permesso per la lettura il percorso ha 2 passi.
- «Rivedi il tutorial» riparte dal primo passo con il percorso giusto, anche dopo «Salta il tutorial».

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour src/modules/settings src/modules/books src/modules/reading src/modules/palette` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo i file dichiarati della task.
