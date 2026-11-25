Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test.

# Statistiche

## Obiettivo

Il modulo `stats` a parità con la 0.3. Leggi `clients/desktop/frontend/src/modules/stats/`, `packages/api/src/resources/stats.ts`, `crates/bookeeper-core/src/api/stats.rs` e il paragrafo "KPI (StatCard)" di `DESIGN.md`.

## Cosa fare

1. **Vista `/stats`**: `PageHeader` "Statistiche". Riga di `StatCard` (da `@bookeeper/ui/book`) per ogni totale che il core restituisce: registro editoriale, etichetta con glifo piccolo colorato per ruolo, valore grande in Lora, conteggio animato. Niente pillole con icona da "metrica eroe".
2. **Distribuzioni** che il core restituisce (per genere, lingua, formato, anno, autori più presenti, mobile: usa quelle che esistono davvero): ognuna è un elenco ordinato di barre orizzontali fatte con `FillBar`, etichetta a sinistra, conteggio a destra, al più 10 righe con "Mostra tutto" che espande. Nessuna libreria di grafici. Ogni elenco è una tabella accessibile (o un elenco con valori leggibili), non solo forme.
3. **Riempimento dei mobili**, se il core lo espone: una `FillBar` con tono `auto` per mobile, collegata a `/shelves?unit=<id>`.
4. **Stati**: scheletri con la stessa griglia; libreria vuota → stato vuoto con rimando a Libri; errore con "Riprova".
5. Le statistiche si aggiornano quando un'altra vista invalida la query `stats`: usa una chiave di query stabile ed esportala da `index.ts`.

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

## Test

- Ogni totale del core ha una `StatCard` con etichetta tradotta; valore finale presente con movimento ridotto.
- Distribuzioni: ordine decrescente, 10 righe poi "Mostra tutto", valori leggibili da tecnologie assistive, categoria vuota resa con un'etichetta "Non indicato".
- Riempimento: toni alle soglie; link al mobile.
- Libreria vuota, errore, scheletri.
- Nessun campo inventato: un test confronta le chiavi usate con il tipo `Stats` di `@bookeeper/api` (controllo di tipo).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/stats/`, `packages/i18n/src/locales/it/stats.json`, `packages/i18n/src/locales/en/stats.json`.
