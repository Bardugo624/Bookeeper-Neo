# Richiesta

Richiesta del proprietario, alla lettera:

> Procedi con fase 6

Fase 6 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`, §7.5 "Blocco F — Famiglia e mobile". Criterio d'uscita: funzioni verificate su desktop e mobile.

La fase si divide in tre run, come la fase 4:

- **6A** (questo): core e client. Persone, inviti, cambio proprietario, "Di chi è", "Chi lo legge", wishlist di famiglia, prestiti a membri, indice ISBN per l'anti-doppio-acquisto.
- **6B**: desktop. Vista persone, ingresso con invito, proprietario del libro e lettori, wishlist di famiglia, prestiti a membri, badge e notifica di sistema per i prestiti scaduti.
- **6C**: PWA. Ingresso con invito, scheda modificabile, prestiti, wishlist, scaffali in sola lettura, anti-doppio-acquisto offline.

Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Fuori dalla fase

- **Notifiche push sulla PWA**: il design permette che slittino a una 2.1. Servono chiavi VAPID, cifratura dei messaggi e un servizio che invia: troppo per questa fase.
- **Eliminazione della libreria**: è nella tabella dei ruoli ma non tra le funzioni del §7.5. Tocca il primo avvio del server; si valuta nella fase 7.
