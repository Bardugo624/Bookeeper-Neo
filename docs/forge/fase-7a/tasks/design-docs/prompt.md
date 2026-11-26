Leggi prima `docs/forge/fase-7a/CONTRATTO.md`. Leggi `PRODUCT.md`, `DESIGN.md`, `docs/forge/fase-2a/CONTRATTO.md`, `docs/forge/fase-2a/MOCKUP.md`, `packages/ui/src/tokens.css`, `packages/ui/src/fonts.css` e i componenti di `packages/ui/src` (`base`, `overlays`, `book`, `shelf`).

# `PRODUCT.md` e `DESIGN.md` per la 2.0

I due file sono il contesto che la skill Impeccable legge prima di ogni comando: il run 7B li userà. Oggi descrivono la 0.3 (app Wails, PrimeVue, `clients/desktop`).

## Cosa fare

1. **`PRODUCT.md`**: stessa struttura e stesse sezioni di oggi (Register, Users, Product Purpose, Brand Personality, Anti-references, Design Principles, Accessibility & Inclusion). Aggiorna ai fatti della 2.0: app desktop Tauri, PWA sul telefono, server; famiglia con ruoli; uso al telefono per scansione, prestiti e "Dov'è?". La personalità, le anti-referenze e i principi restano: sono stati approvati.
2. **`DESIGN.md`**: stessa struttura di oggi (Fondazioni: colore, token, tipografia, motion; Vocabolario componenti; Anti-pattern), riscritta sul codice della 2.0. Ogni token citato esiste in `tokens.css` con quel nome e quel valore; ogni componente citato esiste in `packages/ui`. Motion: le curve e le durate dei token, la regola `prefers-reduced-motion`, i movimenti approvati nei mockup (libro 3D, anello di avanzamento, dorso che si sfila).
3. Aggiungi a `DESIGN.md` una sezione "Decisioni approvate" che elenca ciò che una revisione automatica non deve cambiare: palette verde-salvia e neutri caldi, i caratteri di `fonts.css`, le curve elastiche dei movimenti approvati.

## Acceptance criteria

- Ogni nome di token e di componente citato esiste nel codice (verificalo con una ricerca e riportala).
- Cambiano solo `PRODUCT.md` e `DESIGN.md`.
