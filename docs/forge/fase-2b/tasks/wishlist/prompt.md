Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test.

# Wishlist con conversione in libro

## Obiettivo

Il modulo `wishlist` a parità con la 0.3. Leggi `clients/desktop/frontend/src/modules/wishlist/`, `packages/api/src/resources/wishlist.ts` e `crates/bookeeper-core/src/api/wishlist.rs`.

## Cosa fare

1. **Vista `/wishlist`**: `PageHeader` con conteggio; filtro per priorità con `PillTabs` (valori veri del core); ordinamento per priorità o data. Elenco a card: titolo, autore, priorità (`StatusTag`), prezzo se presente (formattato con `Intl.NumberFormat` dalla valuta e dai centesimi del core), nota, collegamento esterno se il core ha un campo URL (si apre fuori dall'app: `target="_blank"` con `rel="noreferrer"`; solo `http`/`https`). Priorità alta: bordo tinto e velatura, mai strisce laterali.
2. **Azioni** (con permesso di scrittura): aggiungi, modifica, elimina con conferma.
3. **"Ho comprato questo libro"**: chiama la conversione del core (`POST /wishlist/{id}/convert`). Leggi cosa accetta e cosa restituisce. Dopo il successo: toast "Aggiunto ai libri" con azione "Apri" che porta a `/books/<id>`, la voce sparisce dall'elenco, le query di libri e statistiche sono invalidate. Se la conversione accetta campi aggiuntivi (per esempio data d'acquisto o prezzo pagato), un piccolo modulo li chiede prima.
4. **Stati**: scheletri, vuoto, errore.

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

## Test

- Elenco, filtro e ordinamento nell'indirizzo; formattazione del prezzo in entrambe le lingue; collegamento con schema non ammesso non reso come link.
- Aggiungi e modifica: convalida dai limiti del core, corpo della richiesta.
- Elimina con conferma.
- Conversione: richiesta giusta, voce rimossa, toast con azione che porta al libro, invalidazioni.
- Senza permesso di scrittura nessun bottone di azione.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/wishlist/`, `packages/i18n/src/locales/it/wishlist.json`, `packages/i18n/src/locales/en/wishlist.json`.
