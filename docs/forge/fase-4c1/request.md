# Richiesta

Regola permanente del proprietario: "Come sempre, prima integra, poi tutti i P3 poi prossima fase".

Run **4C1**: i difetti P3 lasciati dal revisore nel run 4C, più la build dell'immagine Docker nella release, che sotto emulazione arm64 ha superato un'ora e tre quarti. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. Correggere i sei P3 del desktop.
2. Correggere i cinque P3 della PWA.
3. L'immagine Docker della release usa i binari Linux già compilati dai job `server`: nessuna compilazione Rust sotto emulazione.
