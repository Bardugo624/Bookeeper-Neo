Leggi prima `docs/forge/fase-7a/CONTRATTO.md`. Leggi `apps/mobile/src/modules/search` (`ResultList.tsx`, `useBookSearch.ts`) con i test.

# PWA: liste lunghe

Con 10.000 libri, scorrendo a lungo l'elenco della ricerca il telefono tiene migliaia di righe nel DOM.

## Cosa fare

1. **Rendering a finestra** dell'elenco della ricerca: nel DOM solo le righe visibili più un margine; l'altezza totale è quella delle righe caricate; lo scorrimento resta quello della pagina. Nessuna libreria.
2. Tornando dalla scheda di un libro, l'elenco riprende dalla stessa posizione, come oggi.
3. Il caricamento della pagina successiva parte ancora vicino al fondo.

## Decisione del proprietario: righe di altezza fissa

Dopo tre tentativi il revisore ha trovato che, con il testo ingrandito (150% e oltre), una riga con il titolo su una riga e una con il titolo su due hanno altezze diverse, e la lista a finestra salta. Il proprietario ha deciso:

- Ogni riga dell'elenco DEVE avere la stessa altezza a qualunque dimensione del testo. Il titolo riserva sempre lo spazio di due righe (altezza minima pari a due righe del suo testo, in unità che crescono con il testo), anche quando ne usa una; l'autore resta su una riga.
- L'altezza della riga è la maggiore tra la copertina e il blocco di testo, decisa dal foglio di stile, non dal contenuto.
- Alla dimensione normale del testo l'aspetto NON cambia: comanda la copertina (oggi 105px).
- Il codice misura l'altezza una volta, da una riga qualunque, e la rimisura solo quando cambia la dimensione del testo o la larghezza (per esempio con `ResizeObserver` sulla prima riga); non la prende più "dalla prima riga visibile" a ogni misura.
- Restano valide le correzioni dei tentativi precedenti (ripristino che non si blocca, posizioni salvate che non passano da un test all'altro).

Test aggiunti: un test di stile che verifica la riserva delle due righe del titolo; un test della finestra con altezza misurata costante mentre si scorre una lista di 2.000 righe con titoli di lunghezza diversa; il ripristino dopo un cambio dell'altezza misurata.

## Test

- Con 2.000 righe finte: nel DOM al più 80 righe, qualunque sia la posizione.
- Scorrimento simulato; ritorno dalla scheda alla stessa posizione; pagina successiva.

## Rilevatore di Impeccable

In questo ambiente il plugin Impeccable può aggiungere, dopo le modifiche e alla fine, rilievi di stile sui file dell'interfaccia. Questa task non cambia l'aspetto: non agire su quei rilievi e non toccare stili, testi o colori che la consegna non nomina. La rifinitura dell'interfaccia è il run 7B.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo file sotto `apps/mobile/src/modules/search/`.
