Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# App: componenti e hook condivisi dai moduli

## Obiettivo

Sei moduli stanno per essere scritti in parallelo. Senza una base comune ognuno riscrive conferme, moduli, tabelle e messaggi d'errore. Consegna `apps/desktop/src/kit/` secondo il contratto. Leggi `apps/desktop/src/app/`, `src/session/`, il modulo `books` esistente (per non duplicare ciò che ha già e per capire lo stile) e `crates/bookeeper-core/src/api/confirm.rs` per il flusso di conferma con password.

## Cosa fare

Un file per elemento del contratto, con il proprio `.module.css` dove serve, più `index.ts`. Punti da non sbagliare:

- **`usePasswordConfirm`**: restituisce `{ run(action), dialog }`. `run` esegue `action`; se fallisce con `confirmation_required` apre un `Dialog` che chiede la password, chiama la rotta di conferma del core con i campi veri (leggili), e ripete `action` una volta. Password sbagliata: errore nel dialog, che resta aperto. Annulla: `run` si risolve con `{ cancelled: true }`. `dialog` è il nodo da rendere.
- **`useFormState`**: nessuna libreria di moduli. `submit` non parte due volte; al fallimento della convalida porta il fuoco al primo campo con errore (per `name`).
- **`apiErrorMessage`**: copre almeno `validation`, `not_found`, `conflict`, `forbidden`, `rate_limited` (con i secondi), `payload_too_large`, `network`, e un testo generico per il resto. `overrides` permette a un modulo di dare un testo proprio per un codice. Leggi in `crates/bookeeper-core/src/error.rs` i codici esistenti.
- **`usePermission`**: leggi nel core i ruoli e il loro ordine. `can('write')` è vero per i ruoli che possono creare e modificare libri.
- **`DataTable`**: generica sul tipo di riga; colonne `{ id; header; cell; sortable?; align?; width? }`; ordinamento controllato dall'esterno; riga attivabile con Invio se `onRowClick` è dato; scorrimento orizzontale sotto i 900px.
- **`useListParams`**: schema `{ chiave: { default; parse; serialize } }`; un valore uguale al predefinito non compare nell'indirizzo; `set` sostituisce la voce della cronologia invece di aggiungerne una.
- Date: nessuna libreria; `Intl`. `toUnixSeconds` interpreta la data nel fuso locale a mezzogiorno, così il giorno non scivola.

Testi nello spazio dei nomi `common`, in italiano e in inglese.

## Test

Un file di test per elemento. Almeno:

- `ConfirmDialog`: conferma e annulla chiamano i gestori; `busy` disabilita entrambi; Esc annulla.
- `usePasswordConfirm`: azione riuscita subito; `confirmation_required` → dialog → password giusta → azione ripetuta una volta; password sbagliata → errore e dialog aperto; annulla → `cancelled`.
- `useFormState`: errori per campo, fuoco al primo errore, doppio invio ignorato, azzeramento.
- `apiErrorMessage`: ogni codice elencato; `rate_limited` con `retryAfter: 12` contiene 12; `overrides` vince.
- `usePermission`: una riga per ruolo del core.
- `formatDate`, `formatRelativeDays` (oggi, ieri, tra 3 giorni, 10 giorni fa) in entrambe le lingue; `toUnixSeconds`/`toDateInputValue` andata e ritorno senza scivolare di giorno.
- `DataTable`: `aria-sort`, clic sull'intestazione, Invio sulla riga, stato vuoto.
- `useListParams`: predefiniti assenti dall'indirizzo, analisi di valori non validi che ricade sul predefinito.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti.
- Cambiano solo: file sotto `apps/desktop/src/kit/`, `packages/i18n/src/locales/it/common.json`, `packages/i18n/src/locales/en/common.json`.
