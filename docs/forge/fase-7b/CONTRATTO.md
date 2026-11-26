# Contratto del run 7B

Valgono per intero i contratti delle app (`docs/forge/fase-2a`, `fase-2b`, `fase-2c`, `fase-3a`, `fase-4b`, `fase-4c`, `fase-5a`, `fase-6b`), `PRODUCT.md` e `DESIGN.md`. Il punto di partenza è `docs/forge/fase-7b/AUDIT.md`. Qui ci sono solo le aggiunte.

## Impeccable

- Le task dell'interfaccia usano la skill Impeccable, che sta in `.claude/skills/impeccable/`. Modalità **Operate**: sono schermate di un'app. È **rifinitura**, mai ridisegno: identità, comportamento, testi approvati e tutto ciò che è fuori dal gruppo restano come sono.
- Setup: dalla cartella dell'app (`apps/desktop`, `apps/mobile` o `packages/ui`) esegui `../../.claude/skills/impeccable/scripts/impeccable context` (da `packages/ui`: `../../.claude/skills/impeccable/scripts/impeccable context`). Se non parte, la skill dice cosa fare ("Launcher unavailable"): leggi `PRODUCT.md` e `DESIGN.md` e segui le sue guide.
- Ordine: `/impeccable polish` sul gruppo, poi `/impeccable harden` (stati vuoti, errori, caricamento, testi lunghi, permessi), poi `/impeccable clarify` solo sui testi indicati. Prima di ogni modifica all'interfaccia leggi `reference/craft-floor.md` della skill.
- Questa consegna è il brief completo. Dove la skill farebbe una domanda, decidi secondo la consegna, `PRODUCT.md` e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- Le prove visive del gruppo sono nella cartella `evidenze/` della task (percorso assoluto in testa alla consegna): schermate a 1280×820 (desktop) e 390×844 (telefono), tema chiaro (`-l-`) e scuro (`-d-`). La verifica visiva dopo l'integrazione la fa chi lancia il run, con le stesse 98 schermate e `axe`.
- Alla fine, sul codice che hai cambiato: `.claude/skills/impeccable/scripts/impeccable detect --json <file cambiati>` non trova nulla, a parte le eccezioni registrate in `.impeccable/config.json`.
- Il salvataggio dei rapporti sul servizio di Impeccable NON si usa.

## Decisioni approvate (non si toccano)

Palette verde-salvia e neutri caldi; i caratteri di `packages/ui/src/fonts.css`; le curve elastiche dei movimenti approvati; libro 3D; anello di avanzamento della lettura; dorso che si sfila. Decisione del proprietario: il soprattitolo della scheda del libro va sotto il titolo.

## Token semantici (da `ui-tokens`)

| Token | Uso |
| --- | --- |
| `--bk-accent-surface` | fondo tenue d'accento (oggi `--bk-primary-50`) |
| `--bk-accent-surface-strong` | fondo d'accento più marcato: elemento selezionato o attivo (oggi `--bk-primary-100`) |
| `--bk-on-accent-surface` | testo e icone su quei due fondi |
| `--bk-accent-text` | testo, collegamenti e icone nel colore d'accento |
| `--bk-primary-fill`, `--bk-primary-fill-hover` | fondo dei bottoni e dei controlli principali pieni |
| `--bk-accent-control` | `accent-color`, `caret-color`, indicatori d'accento non testuali |

Ogni token ha un valore per il tema chiaro e uno per il tema scuro. Nei moduli delle app NON si usano i gradini grezzi della palette (`--bk-primary-*`, `--bk-neutral-*`): solo token semantici.

## Accessibilità (WCAG 2.2 AA)

- Testo ≥ 4,5:1 (≥ 3:1 se grande); componenti e indicatori ≥ 3:1; nei due temi.
- Il nome accessibile di un controllo comincia con il suo testo visibile (2.5.3).
- Bersagli ≥ 24×24px sul desktop, ≥ 44×44px sul telefono. Eccezione dichiarata: i dorsi dei mobili (la larghezza dice il numero di pagine).
- Fuoco sempre visibile; nessuna informazione affidata al solo colore; `prefers-reduced-motion` rispettato.

## Regole aggiunte

- Nessuna dipendenza nuova. Nessuna modifica al core, a `packages/api`, agli script di build, a `ops/`.
- Ogni task tocca solo i file dichiarati. Da un altro modulo si importa solo ciò che quello esporta dal suo `index.ts`.
- Ogni rilievo corretto ha un test dove si può provare (ruoli, nomi accessibili, stati, testi). Le sole modifiche di stile le coprono i test di stile.
- Regole di sempre: nessun componente oltre 250 righe; nessun testo nei componenti; nessuna chiamata al client dentro un componente; nessun colore letterale; nomi dei file di test con le stesse maiuscole del file che provano. Telefono: 320px senza scorrimento orizzontale, campi con testo ≥ 16px.
