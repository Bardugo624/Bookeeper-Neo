# Contratto del run 6B

Valgono per intero `docs/forge/fase-2a/CONTRATTO.md`, `docs/forge/fase-2a/MOCKUP.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-5a/CONTRATTO.md`. Rotte, tipi e ruoli sono quelli di `docs/forge/fase-6a/CONTRATTO.md`, già nel client `@bookeeper/api`. Qui ci sono solo le aggiunte.

## Regole aggiunte

- **Dipendenze**: solo `d-notify` ne aggiunge, ed esattamente due: `tauri-plugin-notification` (Rust, versione 2, in `apps/desktop/src-tauri/Cargo.toml`) e `@tauri-apps/plugin-notification` (npm, versione 2, in `apps/desktop/package.json`). Nessun'altra task tocca `Cargo.toml`, `Cargo.lock`, `package.json` o `package-lock.json`.
- Nessuna modifica al core, a `packages/api`, a `packages/ui`, tranne `p3-6a-client`, che aggiunge al client il parametro `scope` della wishlist. Se manca qualcosa, la task si ferma e lo dice.
- Un modulo tocca solo la propria cartella e i propri file i18n. Da un altro modulo importa solo ciò che quello esporta dal suo `index.ts`; se serve un'esportazione nuova, la task che la aggiunge ha quel file tra i dichiarati.
- Le task che toccano la stessa cartella vanno in fila (`d-loans-members` → `d-overdue`; `m-book-edit` → `m-loans` → `m-shelves`; `m-wishlist` → `m-isbn-index`): ognuna parte dal lavoro della precedente e non riscrive ciò che funziona.
- **Permessi**: nel desktop `usePermission().can('write' | 'admin' | 'owner')` di `apps/desktop/src/kit`; nella PWA il modo in cui il modulo `tags` legge il ruolo. Chi non ha il permesso non vede il comando: nessun bottone disattivato senza spiegazione.
- **Ruoli** nell'interfaccia italiana: Proprietario, Admin, Membro, Ospite. Le persone si nominano con il nome che dà il server; chi chiama è "Tu".
- Dopo ogni scrittura si invalidano le query toccate: persone, inviti, libri, faccette, lettori, prestiti, wishlist, indice ISBN, `me`.
- Regole di sempre: nessun componente oltre 250 righe; nessun testo dell'interfaccia nei componenti; nessuna chiamata al client dentro un componente; nessun colore letterale nei fogli di stile; i nomi dei file di test hanno le stesse maiuscole del file che provano. Nella PWA: 320px senza scorrimento orizzontale, bersagli di almeno 44×44px, campi con testo di almeno 16px.

## Indirizzi

- Desktop: `/people`; `/books?owner=<id>|me|none`; `/wishlist?scope=family`; `/loans?mine=1` (i prestiti fatti a chi chiama).
- PWA: `/books/:id/edit`; `/loans`; `/wishlist` e `/wishlist?scope=family`; `/shelves` e `/shelves/:id`.

## Punti di contatto

- Desktop, `NavItem` (`apps/desktop/src/app/types.ts`) guadagna `useBadge?: () => number | null`: la barra laterale la chiama in un componente per voce e mostra il numero, con un nome accessibile dato dalla voce (`badgeLabelKey`). Da `d-overdue`.
- Desktop, `Platform` guadagna `notifications: NotificationControls | null` con `permission(): Promise<'granted' | 'denied' | 'prompt'>`, `request(): Promise<'granted' | 'denied'>`, `send({ title, body }): Promise<void>`. Tauri: il plugin; browser: l'API `Notification` del browser se c'è, altrimenti `null`; finta per i test. Da `d-notify`.
- Desktop, `modules/loans` esporta `useOverdueCount()` (da `d-overdue`).
- PWA, `MobileModule` (`apps/mobile/src/app/types.ts`) guadagna `background?: ComponentType`, montato una volta dentro la shell a sessione aperta, come `overlay` nel desktop. Da `m-isbn-index`.
- PWA, `modules/loans` esporta `LendSheet` (`{ book, onDone }`); `modules/wishlist` esporta `AddWishSheet` (`{ initial?: { isbn?, title?, authors? }, onDone }`).
