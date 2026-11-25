# Contratto del run 2C

Valgono per intero `docs/forge/fase-2a/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- **Dipendenze**: solo `desktop-files` aggiunge dipendenze Rust (in `apps/desktop/src-tauri/Cargo.toml`). Nessuna dipendenza npm nuova. Nessuna modifica al core: se all'API manca qualcosa, la task si ferma e lo dice.
- Riferimento di comportamento: `clients/desktop/frontend/src/views/SettingsView.vue`, la cartella `views/settings/`, `components/OnboardingHint.vue` e `FirstBookCelebration.vue` della 0.3. Leggili; non copiare il codice Vue. Dove la 0.3 e l'API 2.0 divergono, vince l'API 2.0.
- Formati, limiti, codici d'errore e ruoli richiesti si leggono nel core (`crates/bookeeper-core/src/api/{transfer,backup,confirm,labels,auth}.rs`).
- Un file scelto dall'utente si legge con `<input type="file">`. Un file prodotto dall'app si salva con `platform.saveFile`.
- Operazioni distruttive (ripristino, cambio password) usano `usePasswordConfirm` dove il core chiede `confirmation_required`, e passano il gettone di conferma alla ripetizione.

## Piattaforma (da `desktop-files`)

```ts
interface Platform {
  …
  saveFile(req: { suggestedName: string; bytes: Uint8Array; mime: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ saved: boolean; path?: string }>;
}
```

- Tauri: finestra "Salva con nome" del sistema, poi scrittura del file dal lato Rust. Annullare restituisce `{ saved: false }`, senza errore.
- Browser (solo sviluppo): scaricamento tramite URL oggetto.
- Comando Rust `save_file(suggested_name, bytes_base64, filters)`: scrive solo nel percorso scelto dall'utente nella finestra; nessun percorso arriva dalla webview.

## Impostazioni (da `settings`)

Modulo `settings`, rotta `/settings`, voce "Impostazioni", icona `settings`, gruppo `bottom`, ordine 20. La pagina ha una colonna di sezioni a sinistra e il contenuto a destra; la sezione attiva è nell'indirizzo (`/settings/<id>`).

Le sezioni si registrano da sole: ogni cartella `apps/desktop/src/modules/settings/sections/<id>/` esporta da `section.tsx`

```ts
export const section: SettingsSection = { id; labelKey; icon; order; element; visible?: (ctx: { role; platform }) => boolean };
```

e `settings` le raccoglie con `import.meta.glob('./sections/*/section.tsx', { eager: true })`.

| Sezione | Task | Ordine |
| --- | --- | --- |
| `appearance` (tema, lingua) | `settings` | 10 |
| `account` (nome, email, password) | `settings` | 20 |
| `library` (nome della libreria, connessione) | `settings` | 30 |
| `transfer` | `transfer` | 40 |
| `backup` | `backup` | 50 |
| `about` (versione, server) | `settings` | 90 |

## Lingua (da `settings`)

Preferenza `'system' | 'it' | 'en'` in `localStorage`, applicata all'avvio da `apps/desktop/src/app/i18n.tsx` senza ricaricare la pagina; `useLocalePreference()` la espone. `<html lang>` segue la lingua.
