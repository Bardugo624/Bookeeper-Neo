# Richiesta

Richiesta del proprietario, alla lettera:

> approvo, procedi con la fase 2

Run **2B**, il secondo della fase 2 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§6.7, §6.8, §7.1). Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. I cinque difetti P3 lasciati dal revisore nel run 2A1.
2. Moduli a parità con la 0.3 (§7.1): Libri (aggiungi, modifica, elimina, eliminazione multipla, lookup ISBN, numero progressivo, copertine), Scaffali (configurazione, assegnazione, riempimento), Prestiti, Wishlist con conversione in libro, Statistiche, Dispositivi e abbinamento.
3. Aspetto e movimento dei mockup approvati (`docs/forge/fase-2a/MOCKUP.md`).

Fuori da 2B: impostazioni, import/export, backup, etichette, onboarding del primo libro, updater, condivisione in rete, portachiavi, rilascio beta (2C). Stato di lettura (fase 4).

## Limiti noti di questo ambiente

- Nessun display: l'interfaccia si prova nel browser contro un `bookeeper-server` locale.
- I fornitori di lookup ISBN non sono raggiungibili nei test: si usano risposte finte.
