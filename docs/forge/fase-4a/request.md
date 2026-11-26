# Richiesta

Richiesta del proprietario, alla lettera:

> parti con fase 4 completa

Run **4A**, il primo della fase 4 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (§7.2 "Inclusi comunque" e §7.3 "Blocco L"). Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

La fase 4 si divide in tre run: **4A** core e client (questo), **4B** desktop, **4C** mobile.

## Requisiti del run 4A

1. Stato di lettura per persona e per libro: da leggere, in lettura, letto, abbandonato; date; valutazione privata; nota; pagina corrente.
2. Tag: creazione, colore, assegnazione, filtro.
3. Stanze: uno scaffale appartiene a una stanza.
4. Filtri avanzati e ordinamenti nei Libri; valori disponibili per ogni filtro.
5. Registro attività leggibile da proprietario e admin; suggerimento dei nomi già usati nei prestiti.
6. Statistiche di lettura: letti per anno, pagine, calendario, generi.
7. Client TypeScript e specifica OpenAPI allineati.

I campi copia (condizione, data di acquisto, prezzo) sono già nell'API e nell'app: nessun lavoro qui.
