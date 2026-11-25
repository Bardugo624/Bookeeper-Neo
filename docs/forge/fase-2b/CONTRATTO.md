# Contratto del run 2B

Valgono per intero `docs/forge/fase-2a/CONTRATTO.md` (regole, regole del codice React, `packages/ui`, i18n, app) e `docs/forge/fase-2a/MOCKUP.md`. Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- **Dipendenze npm**: le aggiunge solo `devices` (`qrcode` e i suoi tipi, in `apps/desktop`). Le altre task, se manca una dipendenza, si fermano e lo dicono.
- **Nessuna dipendenza Rust nuova.** Nessuna modifica al core: se all'API manca qualcosa, la task si ferma e lo dice, indicando la rotta e il campo.
- Un modulo tocca solo la propria cartella `apps/desktop/src/modules/<nome>/` e i propri due file i18n. Per usare qualcosa di un altro modulo si importa dal suo `index.ts`, mai da file interni.
- Riferimento di comportamento: il modulo omonimo della 0.3 in `clients/desktop/frontend/src/modules/`. Leggilo per capire flussi, campi e regole; non copiare il codice Vue. Dove la 0.3 e l'API 2.0 divergono, vince l'API 2.0 (`packages/api/src/resources/` e `crates/bookeeper-core/src/api/`).
- Codici d'errore, limiti di lunghezza e valori ammessi si leggono nel core. Non inventarli.
- **Ruoli**: le azioni di scrittura si mostrano solo a chi può farle. Leggi in `crates/bookeeper-core/src/api/` quale ruolo richiede ogni rotta e usa `usePermission` di `app-kit`.
- **Scritture**: ogni mutazione invalida le query toccate (elenco, dettaglio, conteggi, statistiche). Nessun aggiornamento ottimistico salvo dove la task lo chiede. Durante l'invio il bottone è in `loading` e non parte una seconda richiesta. Un errore lascia il modulo compilato e mostra il messaggio.
- **Eliminazioni**: sempre con conferma (`ConfirmDialog`), bottone `danger`, testo che nomina ciò che si elimina. Dove il core richiede la conferma con password (`confirmation_required`), si usa `usePasswordConfirm` di `app-kit`.

## `apps/desktop/src/kit` (da `app-kit`)

```ts
PageHeader        // { title; count?; actions? } — titolo in Lora 28 e riga di conteggio, come nel mockup
ConfirmDialog     // { open; title; description; confirmLabel; tone?: 'danger'; busy?; onConfirm; onCancel }
usePasswordConfirm()   // esegue un'azione; su `confirmation_required` chiede la password, chiama POST /confirm e ripete l'azione
FormDialog        // Dialog con <form>, piede Annulla/Salva, invio con Invio, errori generali in alto
useFormState<T>(initial, validate)   // valori, errori per campo, `touched`, `submit(handler)` che porta il fuoco al primo errore
apiErrorMessage(t, error, overrides?)   // testo per un ApiError: codici noti del core, rete, rate limit con secondi
usePermission()   // { role; can(action: 'write' | 'admin' | 'owner') } dal ruolo in `me`
formatDate(locale, unixSeconds, style?)    // Intl.DateTimeFormat
formatRelativeDays(locale, unixSeconds, now?)
toUnixSeconds(dateInputValue), toDateInputValue(unixSeconds)
DataTable         // intestazioni ordinabili con aria-sort, riga cliccabile, stato vuoto
StatusTag         // Tag con tono da uno stato
useListParams(schema)   // ricerca, filtro e ordinamento nei parametri dell'indirizzo
```

Spazio dei nomi i18n `common`: Salva, Annulla, Elimina, Modifica, Chiudi, Riprova, Conferma, campi obbligatori, errori generici per codice.

## `@bookeeper/ui/shelf` (da `ui-shelf`)

```ts
ShelfUnit   // { color; rows: ShelfRow[]; onSpineClick?; onSlotDrop?; selectedId?; dropTarget? }
ShelfRow    // { id; label; capacity?: number; books: SpineBook[] }
SpineBook   // { id; title; author?; pages?: number; color?: string }
spineWidth(pages?: number): number     // 12..34 px, lineare tra 80 e 900 pagine; senza pagine 20
spineHeight(seed: string): number      // 86..100 (percento), deterministica
SHELF_COLORS: readonly string[]        // colori dei mobili della 0.3
```

Esportato in `packages/ui/package.json` come `./shelf`.

## Moduli e voci di navigazione

| Modulo | Rotta | Voce | Icona | Gruppo | Ordine |
| --- | --- | --- | --- | --- | --- |
| `books` | `/books` | Libri | `book` | `main` | 10 |
| `shelves` | `/shelves` | Scaffali | `library` | `main` | 20 |
| `loans` | `/loans` | Prestiti | `loans` | `main` | 30 |
| `wishlist` | `/wishlist` | Wishlist | `heart` | `main` | 40 |
| `stats` | `/stats` | Statistiche | `chart` | `main` | 50 |
| `devices` | `/devices` | Dispositivi | `phone` | `bottom` | 10 |

## Punti di contatto tra moduli

- `loans` esporta da `index.ts`: `LendDialog` (`{ book: { id, title }; open; onClose }`) e `useActiveLoan(bookId)`.
- `books-edit` li usa per il bottone "Presta" e per la scheda "Prestiti" della scheda libro.
- I collegamenti tra moduli sono indirizzi: `/books/<id>`, `/shelves?unit=<id>`, `/loans?book=<id>`.
