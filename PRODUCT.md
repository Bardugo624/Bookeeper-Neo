# Product

## Register

product

## Users

Membri di una famiglia / convivenza che gestiscono la biblioteca di casa: catalogano libri (spesso via ISBN), li assegnano a scaffali fisici, tracciano prestiti ad amici e wishlist. Uso desktop prevalente (app Wails), sessioni frequenti ma brevi ("aggiungo i tre libri comprati oggi"), più sessioni lunghe di riordino. Utenti non tecnici: il self-hosting è invisibile (modalità "libreria locale" one-click) o gestito da un familiare smanettone.

## Product Purpose

Bookeeper Neo è il gestionale della libreria domestica: robusto, privato (self-hosted), completo (copertine, metadati automatici, statistiche, prestiti, multi-dispositivo). Successo = il catalogo è sempre aggiornato perché aggiungere e trovare libri è più veloce e piacevole che non farlo.

## Brand Personality

Biblioteca moderna: editoriale, sereno, caldo — ma con dettagli contemporanei (profondità, ombre morbide, micro-interazioni raffinate). Tre parole: **colto, accogliente, preciso**. L'interfaccia deve far sentire l'utente nella propria libreria, non in un ufficio.

## Anti-references

- **SaaS generico**: niente dashboard aziendale anonima, hero-metric template, card grid tutte uguali. Deve sembrare fatto per chi ama i libri.
- Goodreads/Amazon: niente affollamento commerciale, rating ovunque, social.
- App "giocattolo": la vivacità non deve costare serietà d'uso.

## Design Principles

1. **Il libro è il protagonista**: copertine, titoli e metadati hanno la scena; il chrome dell'app arretra.
2. **Familiarità guadagnata**: pattern standard (sidebar, tabelle, form) eseguiti con cura, non reinventati.
3. **Motion che comunica**: transizioni di stato, feedback sui gesti, skeleton loading — mai coreografie che bloccano il flusso.
4. **Caldo ma leggibile**: la palette verde-salvia + neutri caldi resta; il contrasto del testo non si sacrifica mai all'eleganza.
5. **Ogni stato è disegnato**: vuoto, caricamento, errore, primo avvio insegnano l'interfaccia invece di lasciare buchi.

## Accessibility & Inclusion

- Contrasto testo ≥ 4.5:1 (body) / 3:1 (large) in entrambi i temi light/dark.
- `prefers-reduced-motion` rispettato globalmente (già in style.css, da mantenere in ogni nuova animazione).
- Navigazione tastiera completa e `:focus-visible` sempre visibile.
- UI in italiano; testi chiari senza gergo tecnico (il gergo "tenant" sta migrando verso "libreria").
