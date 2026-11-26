Leggi prima `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. La task `p3-4b-app` è già unita: parti dal suo codice.

# Desktop: difetti d'aspetto del run 4B

Trovati guardando l'app nel browser con una libreria di prova.

1. **Etichetta "In prestito" sulla copertina** (`apps/desktop/src/modules/books/BookCard.tsx` e il suo foglio di stile): su una copertina scura il testo quasi non si legge (scritta ambra su velatura scura). Regola: etichetta su fondo pieno chiaro (superficie dell'app) con il testo nel tono d'avviso, contrasto almeno 4,5:1 nei due temi, su qualunque colore di copertina. Solo token.
2. **Collegamenti nel Registro attività** (`apps/desktop/src/modules/settings/sections/audit/AuditWhat.tsx`): i titoli dei libri appaiono con il blu e la sottolineatura predefiniti del browser. Regola: colore del testo, sottolineatura sottile, verde d'accento al passaggio e al fuoco, come gli altri collegamenti nel testo dell'app.
3. **"1 ripiani da 6 posti"** (`shelves.json`, chiave `layout`, e ogni altra frase con un numero nello stesso file): usa le forme plurali `{one, other}` del pacchetto i18n, per ripiani e per posti, in italiano e in inglese. Se una frase ha due numeri, dividila in due chiavi composte dal componente.
4. **Selettore dell'anno nelle Statistiche di lettura** (`apps/desktop/src/modules/stats/ReadingTab.tsx` e il suo foglio di stile): occupa tutta la riga. Regola: largo quanto serve al contenuto (circa 160px), con "Il tuo anno in libri" allineato a destra sulla stessa riga; sotto i 560px i due vanno a capo.
5. **Campi data del Registro attività**: le due etichette "Dal" e "Al" e i tre selettori stanno su due righe disallineate. Regola: una griglia sola, cinque campi con la stessa altezza, "Azzera filtri" allineato alla base dei campi.

Per ogni punto un test dove si può provare (forme plurali, classi e ruoli); i punti di solo stile li copre `styles.test.ts`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/books/`, `apps/desktop/src/modules/settings/sections/audit/`, `apps/desktop/src/modules/shelves/`, `apps/desktop/src/modules/stats/`, i file i18n `shelves.json`, `books.json`, `audit.json`, `stats.json` (it e en).
