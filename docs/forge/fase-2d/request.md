# Richiesta

Richiesta del proprietario, alla lettera:

> approvo, procedi con la fase 2

Scelte del proprietario: nella beta entrano condivisione in rete, portachiavi di sistema, workflow di rilascio desktop; aggiornamenti con chiave di firma come secret di GitHub; manifest e installer serviti dalla VPS, dietro `app.neokeeper.dev`.

Run **2D**, l'ultimo della fase 2 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§6.4 Trasporto, §6.5, §6.7). Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. I tredici difetti P3 lasciati dal revisore nel run 2C e tre ritocchi visti provando l'app.
2. Token di sessione nel portachiavi di sistema.
3. Condivisione in rete dall'app desktop: porta in LAN con certificato autogenerato, annuncio mDNS, frase di verifica.
4. Aggiornamenti: controllo, note di versione, installazione; canali stable e beta.
5. Workflow di rilascio: installer per Windows, macOS e Linux, firma degli aggiornamenti, manifest, pubblicazione sulla VPS.

## Limiti noti di questo ambiente

- Nessun display e nessun portachiavi di sistema: le parti che li richiedono si provano dietro un'astrazione.
- I workflow di GitHub non girano qui: si verificano i comandi e gli script che contengono.
- La chiave pubblica di firma non esiste ancora: senza, la build non cerca aggiornamenti.
