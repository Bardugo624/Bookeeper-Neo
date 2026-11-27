Leggi prima `docs/forge/fase-8b1/CONTRATTO.md` e `docs/forge/fase-8b1/request.md`.

# Impostazioni: allineate alle altre pagine, registro leggibile a ogni larghezza

Controllo a schermo dopo l'integrazione dell'8B, con finestre di 960 px (la più piccola che l'app consente), 1280, 1920 e 2560 px.

1. **La pagina è centrata.** `SettingsPage.module.css` dà a `.page` `max-width: 1280px` e `margin-inline: auto`. Tutte le altre pagine dell'app partono subito dopo la barra laterale e non hanno un massimo: a 1920 px il titolo «Impostazioni» parte circa 200 px più a destra dei titoli delle altre pagine, a 2560 px metà schermo resta vuota. Regola: la pagina parte dove partono le altre (niente centratura); un massimo di circa 1600 px, solo perché i testi restino leggibili.
2. **Il registro attività schiaccia «Cosa».** In `sections/audit/AuditTable.tsx` «Quando» (11rem), «Chi» (12rem) e «Dispositivo» (12rem) hanno larghezze fisse. A 1280 px «Cosa» riceve circa 120 px e va a capo su quattro righe; a 960 px va a capo lettera per lettera. Prima dell'8B non succedeva. Regola:
   - «Quando», «Chi» e «Dispositivo» sono larghe quanto il loro contenuto e non vanno a capo; «Cosa» prende tutto il resto.
   - Quando lo spazio del contenuto è stretto (container query sul contenitore `settings-content` di `SettingsPage.module.css`, sotto circa 720 px), ogni voce diventa un blocco: in alto «quando · chi · dispositivo» su una riga, piccolo e attenuato; sotto, «Cosa» a tutta larghezza. In quella forma niente intestazioni di colonna visibili; il nome accessibile della tabella e l'ordine di lettura restano. Niente scorrimento orizzontale.
   - Il kit (`src/kit/DataTable*`) NON si tocca: lo stile del registro sta in `AuditSection.module.css`, anche con selettori sugli elementi della tabella dentro la classe del registro.
3. **Il test dei filtri controlla solo la classe** (nota del revisore dell'8B). Aggiungi un test di stile che fallisce se la regola dei campi stretti di `SettingsBlock.module.css` (`.body > :where(input, select, label, form)`, `max-width: 28rem`) torna a vincere sui filtri del registro (`.filters.filters`, `max-width: none`).

## Test

- Stile: nessuna centratura della pagina e il suo massimo; le colonne «Quando», «Chi» e «Dispositivo» senza larghezze fisse e con `white-space: nowrap`; la forma a blocchi dentro una container query.
- I test del registro e delle impostazioni esistenti passano.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/settings src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Nessun colore letterale; nessun componente oltre 250 righe.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/settings/`.
