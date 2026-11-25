# Richiesta

Richiesta del proprietario, alla lettera:

> approvo, procedi con la fase 2

Run **2A**, il primo della fase 2 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§6.4, §6.7, §6.8). Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

I mockup approvati sono descritti in `docs/forge/fase-2a/MOCKUP.md`. Il proprietario ha approvato anche quattro idee di movimento: libro 3D, anello di avanzamento, tooltip a molla, indicatore scorrevole.

## Requisiti

1. **`packages/ui`**: token completi, icone a tratto, componenti propri su primitive accessibili, più `BookCover`, `Book3D`, `ProgressRing`, `FillBar`, `StatCard`, `PillTabs`, `Tooltip`.
2. **Cataloghi i18n per spazio dei nomi**, così ogni modulo aggiunge i propri file senza toccare quelli degli altri.
3. **Guscio Tauri**: connessioni salvate, finestra senza cornice di sistema, trasporto verso un server remoto con impronta fissata, scoperta in rete.
4. **App React**: fornitori, sessione, router a moduli, guscio con sidebar e barra del titolo integrata, tema chiaro/scuro/sistema.
5. **Primo avvio** con i quattro percorsi del design: Crea qui, Unisciti, Crea su un server, Bentornato.
6. **Vista Libri in sola lettura**: griglia, ricerca, filtri, scheletri, stato vuoto, scheda libro.

Fuori da 2A: creazione e modifica dei libri e gli altri moduli (2B); impostazioni, import/export, backup, etichette, updater, condivisione in rete, portachiavi di sistema, rilascio beta (2C).

## Limiti noti di questo ambiente

- Nessun display: l'app Tauri non si avvia qui. L'interfaccia si prova nel browser, in modalità sviluppo, contro un `bookeeper-server` locale.
- Il multicast mDNS può non funzionare: la prova di scoperta reale è `#[ignore]`.
- I token di sessione sono salvati in un file dell'app con permessi `0600`. Il portachiavi di sistema arriva nel run 2C.
