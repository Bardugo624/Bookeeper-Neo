Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test. La task `labels` è già unita.

# Onboarding del primo libro

Riferimento: `clients/desktop/frontend/src/components/OnboardingHint.vue` e `FirstBookCelebration.vue` della 0.3, e dove venivano usati. Leggili per capire quando comparivano e cosa dicevano.

## Cosa fare

1. **Modulo `onboarding`** senza voce di navigazione: esporta `FirstBookHint` e `FirstBookCelebration`.
2. **Libreria vuota** (vista Libri, nessun libro e nessun filtro): al posto dello stato vuoto semplice, un invito in tre passi (Aggiungi il primo libro per ISBN · Crea un mobile · Collega il telefono o un altro computer) con il bottone primario "Aggiungi il primo libro" che apre il pannello "Nuovo libro". I passi 2 e 3 sono link a `/shelves` e `/devices`. Solo per chi può scrivere; gli altri vedono lo stato vuoto di prima.
3. **Primo libro creato**: quando la creazione porta il totale da 0 a 1, una celebrazione sobria: `Dialog` con il `Book3D` del libro appena aggiunto che entra con rise e una riga di testo, bottoni "Aggiungine un altro" e "Vai alla libreria". Niente coriandoli. Si mostra una sola volta per connessione (ricordato in `localStorage` sotto l'id della connessione). Con movimento ridotto compare senza animazione.
4. Gli agganci nel modulo `books` sono due: lo stato vuoto e il punto in cui la creazione riesce. Nessun'altra modifica a `books`.

Testi nello spazio dei nomi `onboarding`.

## Test

- Libreria vuota con permesso di scrittura → invito con tre passi; il bottone apre "Nuovo libro"; senza permesso → stato vuoto di prima; con un filtro attivo e nessun risultato → "Nessun risultato", non l'invito.
- Creazione da 0 a 1 → celebrazione col titolo del libro; da 1 a 2 → nulla; seconda volta sulla stessa connessione → nulla; altra connessione → sì.
- "Aggiungine un altro" riapre il pannello; "Vai alla libreria" chiude.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/onboarding/` e `apps/desktop/src/modules/books/`, `packages/i18n/src/locales/it/onboarding.json`, `packages/i18n/src/locales/en/onboarding.json`.
