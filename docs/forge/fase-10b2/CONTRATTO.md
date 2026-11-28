# Contratto della fase 10B2

Vale tutto il contratto della 10B (`docs/forge/fase-10b/CONTRATTO.md`) e quello della 10B1. Gli schizzi approvati sono in `docs/superpowers/specs/2026-11-28-lettore/`; le catture della revisione in `.impeccable/review/lettore/`.

## Valori
- **Il tema del lettore arriva anche nelle finestrelle e nei fogli.** Finché il lettore è aperto, `ReaderScreen` mette su `document.documentElement` le variabili `--rd-*` del tema e, sopra quelle del kit, i token che finestrelle, fogli, menu e avvisi usano: `--bk-surface`, `--bk-surface-raised`, `--bk-bg`, `--bk-border`, `--bk-border-strong`, `--bk-text`, `--bk-text-strong`, `--bk-text-muted`, `--bk-text-faint`, `--bk-inset`, `--bk-accent-surface`, `--bk-accent-surface-strong`, `--bk-on-accent-surface`, `--bk-accent-text`, `--bk-accent-control`, più `color-scheme` (`dark` nei temi scuri). All'uscita rimette i valori di prima.
- **Carattere di riserva:** con «Editore» e gli stili dell'editore accesi, una pagina il cui `body` ha come famiglia solo un nome generico (`serif`, `sans-serif`, `Times New Roman`, `Times`) e nessun `@font-face` usa Lora.
- **Linea sottile:** traccia a tutta larghezza alta 2 px in `--rd-rule`, con il riempimento in `--rd-accent-solid` per la parte letta. Si vede anche allo 0%.
- **Risultati della ricerca e indice:** sotto il 10% la percentuale ha una cifra decimale («0,4%»).
