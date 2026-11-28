# Contratto della fase 10B1

Vale tutto il contratto della 10B (`docs/forge/fase-10b/CONTRATTO.md`), con gli stati disegnati in `docs/superpowers/specs/2026-11-28-lettore/`. Qui ci sono solo i valori di questo giro.

## Valori
- **Fogli dal basso:** gli stili stanno in un foglio CSS globale (`Sheet.css`, `BottomSheet.css`) importato per effetto, non in un modulo CSS. Vite toglie dalla build un modulo CSS importato solo per effetto.
- **Mai più:** `packages/ui/src/cssModuleImports.test.ts`, come `caseCollisions.test.ts`, scorre i file tracciati di `packages` e `apps` e fallisce se trova `import './X.module.css';` senza un nome.
- **Tacche dei capitoli:** al massimo 40. Se i capitoli sono di più, una tacca resta solo se dista almeno 1/40 della barra dalla precedente tenuta. La prima resta sempre.
- **«In lettura» sul computer:** la riga ha sempre 4 colonne uguali, anche con meno libri; una card non si allarga.
- **«Leggi» sul telefono:** subito sotto titolo e autore, prima di ogni blocco della scheda, a tutta larghezza, come nello schizzo `08`.
- **Aspetto sul computer:** una finestrella non modale ancorata sotto il pulsante Aa, senza velo sulla pagina, come nello schizzo `04`. Si chiude con Esc, con un clic fuori o con lo stesso pulsante, e il fuoco torna al pulsante.
  - Il tema si sceglie con cinque riquadri che mostrano «Aa» nei colori del tema e il nome sotto; «Auto» è diviso in diagonale fra chiaro e scuro.
  - Sul telefono resta il foglio dal basso; la riga «Due pagine quando c'è spazio» non c'è.
- **`Popover` del kit:** `@bookeeper/ui/overlays` riceve `Popover` (Radix), con `--bk-surface-raised`, `--bk-border`, `--bk-radius`, `--bk-shadow-3` e l'entrata `bk-rise` dentro `prefers-reduced-motion: no-preference`. Props: `open`, `onOpenChange`, `trigger`, `label`, `children`, `side?`, `align?`.
- **Bersagli sul telefono:** almeno 44×48 px, anche per il pulsante della schermata d'errore e per la ✕ dei fogli.
- **La domanda nella barra in basso:** l'azione principale («Vai al 45%», «Segna come letto») è un `Button` pieno (`variant="primary"`).

## Regole
- Ogni task che cambia Rust passa `cargo fmt --all -- --check`.
- Ogni task d'interfaccia guarda il risultato in Chromium nella build di produzione (`vite build`), non solo nei test: i difetti di questo giro si vedevano solo lì.
