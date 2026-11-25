# Richiesta

Richiesta del proprietario, alla lettera:

> Esegui la PR e poi lancia la fase 3

Run **3A**, fase 3 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§6.4 "Mobile e HTTPS", §6.9, §7.1). Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. PWA React in `apps/mobile`, servita dal server sulla stessa origine dell'API.
2. Parità con la PWA 0.3: cerca, scansiona, account.
3. Abbinamento da QR senza digitare nulla, oppure con codice. Niente CSR né certificati nel browser.
4. Fuori da un contesto sicuro la PWA mostra solo una pagina che spiega cosa serve, senza parole tecniche (D7).
5. Aggiornamento con banner non bloccante.

## Limiti noti di questo ambiente

- Nessuna fotocamera: la scansione si prova con una sorgente finta.
- Nessun telefono: l'interfaccia si prova in un browser con finestra da telefono.
