# Richiesta

Richiesta del proprietario, alla lettera:

> attendi l'esito della CI e fai merge
> correggi eventuali problemi e poi vai con la fase 7

Fase 7 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§8): "Verifica accessibilità, prestazioni con 10.000 libri, `docs/deploy.md`, reinstallazione del server di produzione, rimozione alberi 0.3, aggiornamento `DESIGN.md`, `README`, `ROADMAP`". Criterio d'uscita: rilascio `2.0.0` stabile.

La fase si divide in tre run:

- **7A** (questo): rimozione della 0.3, prestazioni con 10.000 libri, documentazione, `PRODUCT.md` e `DESIGN.md` aggiornati alla 2.0.
- **7B**: giro di rifinitura dell'interfaccia con la skill Impeccable, che usa `PRODUCT.md` e `DESIGN.md` come contesto, più le correzioni di accessibilità trovate con `axe` sulle schermate vere.
- **7C**: versione `2.0.0`, note di rilascio dal `CHANGELOG`, rilascio, reinstallazione del server di produzione (su via libera del proprietario).

Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Fuori dalla 2.0

- Notifiche push sulla PWA (2.1).
- Eliminazione della libreria (2.1): backup e ripristino coprono già il "ricominciare da capo".
