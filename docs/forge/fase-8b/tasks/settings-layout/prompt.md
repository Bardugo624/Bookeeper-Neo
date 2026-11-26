Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` (l'ultima richiesta), `PRODUCT.md` e `DESIGN.md`. La task `fix-8a1-p3` è già unita.

# Impostazioni: usare lo spazio dello schermo

## Il problema

Il contenuto delle impostazioni ha `max-width: 640px` (`apps/desktop/src/modules/settings/SettingsPage.module.css`), qualunque sia la finestra. A tutto schermo resta una colonna stretta con mezzo schermo vuoto; nel **Registro attività** la colonna «Cosa» va a capo su tre o quattro righe. Il proprietario vuole che le schermate delle impostazioni usino meglio lo spazio disponibile.

Setup di Impeccable da `apps/desktop` con `--target src/modules/settings/SettingsPage.tsx`; leggi `reference/layout.md`, `reference/operate.md` e `reference/craft-floor.md`. È rifinitura dell'impaginazione: testi, comportamento, zone pericolose e permessi restano come sono.

## Cosa fare

1. **Il contenuto si allarga con la finestra**: niente tetto a 640 px; un massimo generoso (circa 1280 px) con margini coerenti con le altre pagine dell'app.
2. **Schede affiancate sugli schermi larghi**: quando lo spazio del contenuto lo permette (container query, per esempio da circa 960 px), le schede di una sezione si dispongono in due colonne; sotto, una colonna come oggi. Ogni `SettingsBlock` può chiedere tutta la larghezza (`span` pieno) quando contiene dati, elenchi o una zona pericolosa. I campi dei moduli NON si allargano a dismisura: restano di larghezza leggibile (circa 28rem al massimo).
3. **Sezioni per sezione** (decidi tu gli abbinamenti, con questi criteri): Account (profilo e password affiancati; zona pericolosa a tutta larghezza); Backup (backup a mano e programmato affiancati; elenco dei backup automatici e zona pericolosa a tutta larghezza); Aspetto, Libreria, Notifiche, Import ed export, Condivisione, Aggiornamenti, Informazioni (schede affiancate dove ha senso).
4. **Registro attività a tutta larghezza**: tabella su tutto lo spazio, con «Quando», «Chi» e «Dispositivo» larghe quanto serve (la prop `width` delle colonne di `DataTable`; il kit NON si tocca) e «Cosa» con il resto, su una riga quando entra; i filtri (persona, dispositivo, azione, dal, al, azzera) su una riga sola quando c'è spazio; il conteggio e «Scarica CSV» allineati sopra la tabella.
5. Sotto i 720 px resta tutto su una colonna, come oggi; niente scorrimento orizzontale della pagina.

## Test

- Il contenuto non ha più il tetto di 640 px (test di stile sul foglio) e c'è la regola che affianca le schede sugli schermi larghi.
- `SettingsBlock` con la larghezza piena ha la sua classe; i blocchi di dati, gli elenchi e le zone pericolose la usano.
- Il registro attività: la tabella e i filtri hanno le classi dell'impaginazione larga; il resto dei test del registro passa.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/settings src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Nessun componente oltre 250 righe; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/settings/`.
