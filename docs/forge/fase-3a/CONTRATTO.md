# Contratto del run 3A

Valgono le regole del codice React, di stile, di movimento e di accessibilità di `docs/forge/fase-2a/CONTRATTO.md`, e l'aspetto di `docs/forge/fase-2a/MOCKUP.md` per colori, caratteri, bottoni, campi e copertine. Qui ci sono le regole della PWA. Dove i file divergono, vince questo.

## Regole

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- **Dipendenze npm**: le aggiunge solo `m-foundation`, in `apps/mobile/package.json`. Le altre task, se manca una dipendenza, si fermano e lo dicono.
- **Nessuna modifica** a `packages/ui`, `packages/api`, al core, ad `apps/desktop`. Se manca qualcosa, la task si ferma e lo dice.
- Riferimento di comportamento: `clients/mobile-web/src/` della 0.3. Leggilo per flussi e testi; non copiare il codice Vue. CSR, certificati e archivio delle chiavi della 0.3 NON si portano.
- Nessuna interfaccia morta. Nessun testo scritto nei componenti: spazi dei nomi i18n propri, in italiano e in inglese.
- Nessun accesso a Internet nei test. Fotocamera, `BarcodeDetector`, service worker e `navigator` si usano dietro piccole interfacce con implementazioni finte.
- **Telefono prima di tutto**: larghezza di riferimento 390px; bersagli tattili almeno 44×44px; nessuno scorrimento orizzontale a 320px; `env(safe-area-inset-*)` rispettato in alto e in basso; campi con dimensione del testo di almeno 16px per evitare lo zoom automatico; `viewport-fit=cover`.

## Struttura (da `m-foundation`)

```
apps/mobile/src/
  app/        fornitori, router, cancello del contesto sicuro, raccolta dei moduli
  session/    sessione, trasporto autenticato, client
  shell/      barra delle schede in basso, intestazione, banner di aggiornamento
  kit/        pezzi condivisi dai moduli (schermata piena, elenco, errore)
  platform/   interfacce verso browser: fotocamera, codici a barre, service worker, archivio
  modules/<nome>/routes.tsx
```

Ogni modulo esporta da `routes.tsx`:

```ts
export const module: MobileModule = {
  id: string,
  routes: RouteObject[],                 // dentro il guscio a schede
  tab?: { labelKey: string; icon: IconName; to: string; order: number },
  public?: RouteObject[],                // fuori dal guscio (abbinamento)
};
```

raccolti con `import.meta.glob('./modules/*/routes.tsx', { eager: true })`. Router: `createHashRouter` (il QR del desktop apre `<indirizzo>/#/pair?code=<codice>`).

| Modulo | Rotte | Scheda | Ordine |
| --- | --- | --- | --- |
| `search` | `/search`, `/books/:id` | Cerca, icona `search` | 10 |
| `scan` | `/scan` | Scansiona, icona `grid` o la più adatta | 20 |
| `account` | `/account` | Account, icona `settings` | 30 |
| `pair` | pubbliche: `/pair`, `/pair/code` | — | — |

## Contesto sicuro (D7)

Se `window.isSecureContext` è falso, l'app mostra solo la pagina "Serve un indirizzo sicuro" (testo esistente `mobile.needsHttps`, più due righe che dicono a chi rivolgersi) e non fa alcuna richiesta di rete. `localhost` conta come sicuro, come dice il browser.

## Sessione

- Stesso server, stessa origine: `createFetchTransport('')`.
- Token in `localStorage` sotto `bookeeper.mobile.session` (`{ access_token, refresh_token, device_id }`). Stato `'loading' | 'unpaired' | 'ready'`.
- Avvio: con token → `GET /me`; 401 `token_expired` o `unauthorized` → un rinnovo; `device_revoked` o rinnovo rifiutato → `unpaired` e token cancellati. Il codice d'errore si legge da `body.error_code`.
- `unpaired`: ogni rotta protetta porta a `/pair`.
- `device_kind` è `mobile`; `device_name` è ricavato dal browser (per esempio "iPhone · Safari"), modificabile al momento dell'abbinamento.

## PWA

- `vite-plugin-pwa` con manifest (nome "Bookeeper", colori dai token, `display: standalone`, icone generate da quelle esistenti dell'app desktop) e service worker in modalità "chiedi": la versione nuova non si attiva da sola.
- Guscio dell'app in cache per l'avvio senza rete; le chiamate `/api/` NON sono mai messe in cache dal service worker.
- Banner non bloccante "È disponibile una nuova versione" con "Aggiorna"; ricarica solo dopo il tocco.
- Senza rete: striscia "Sei offline" e le viste mostrano l'ultimo risultato in memoria, se c'è.

## Build

`apps/mobile/dist` è incorporato nel binario del server (`crates/bookeeper-server/src/web.rs`, `build.rs`). I file generati dal plugin PWA (service worker, manifest) DEVONO finire in `dist` ed essere serviti con il tipo giusto; il service worker è servito senza cache lunga. Se serve una modifica al server oltre `build.rs`, la task si ferma e lo dice.
