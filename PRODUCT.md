# Product

## Register

product

## Users

Membri di una famiglia / convivenza che gestiscono la biblioteca di casa, ciascuno con un ruolo: Proprietario, Admin, Membro, Ospite. Catalogano libri (spesso via ISBN), li assegnano a scaffali fisici, tracciano prestiti ad amici e wishlist, e registrano lo stato di lettura di ciascuno.

Tre superfici, stessa libreria:

- **App desktop (Tauri)**: l'uso prevalente per il riordino e le sessioni lunghe ("sistemo la stanza dei ragazzi"), ma anche per quelle brevi ("aggiungo i tre libri comprati oggi"). Può usare una libreria locale o collegarsi a un server.
- **PWA sul telefono**: lo strumento da tasca. Si usa in libreria o in negozio per scansionare un ISBN, registrare un prestito al volo e rispondere a "Dov'è?" (mobile e ripiano del libro, con il dorso evidenziato).
- **Server**: self-hosted, tiene la libreria raggiungibile da tutti i dispositivi della famiglia.

Utenti non tecnici: il self-hosting è invisibile o gestito da un familiare smanettone.

## Product Purpose

Bookeeper Neo è il gestionale della libreria domestica: robusto, privato (self-hosted), completo (copertine, metadati automatici, statistiche, prestiti, famiglia con ruoli, più dispositivi). Successo = il catalogo è sempre aggiornato perché aggiungere e trovare libri è più veloce e piacevole che non farlo, sia alla scrivania sia con il telefono in mano.

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
- `prefers-reduced-motion` rispettato: ogni animazione sta dentro `@media (prefers-reduced-motion: no-preference)` e con movimento ridotto lo stato finale è immediato.
- Navigazione tastiera completa e `:focus-visible` sempre visibile (anello 2px `--bk-focus`).
- Sul telefono: ogni azione resta raggiungibile con un semplice tocco, senza gesti obbligatori.
- UI in italiano; testi chiari senza gergo tecnico (il gergo "tenant" sta migrando verso "libreria").
