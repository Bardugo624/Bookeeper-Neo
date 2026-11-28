# Richiesta

Regola permanente del proprietario: «Come sempre, prima integra, poi tutti i P3 poi prossima fase».

Il run 10B, il lettore di e-book, è integrato (2026f5d). Questo giro corregge:
- i P3 che i revisori hanno lasciato come problemi noti;
- il P2 che il proprietario ha accettato per dopo («Accetta, correggi dopo»): sul telefono il pulsante della schermata d'errore è alto 36 px;
- i difetti trovati guardando nel browser il lettore integrato, a 1280×800 e a 390×844, con un server locale e due e-book.

Il difetto più grande viene da prima della 10B: sul telefono i fogli dal basso compaiono come finestre centrate, perché i loro stili non arrivano nella build. Vale per il `BottomSheet` dell'app, dalla fase 3, e per il `Sheet` del lettore.

Poi vengono la revisione finale, `DESIGN.md` e la domanda sulla release.
