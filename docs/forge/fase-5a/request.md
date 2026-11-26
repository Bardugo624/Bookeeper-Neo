# Richiesta

Richiesta del proprietario, alla lettera:

> Procedi con la fase 5

Run **5A**: la fase 5 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`, §7.4 "Blocco S — Scaffale fisico". Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Cosa esiste già

Scaffali con ripiani e posti, trascinamento dal vassoio e dentro un mobile, "Colloca in…" da tastiera, evidenziazione con `/shelves?unit=&book=`, "Dov'è?" nella palette e nella scheda del libro, dorso dal colore della copertina con ripiego sulla tinta deterministica, larghezza del dorso dalle pagine, `spine_width` (1–3) nell'API, collocazione con scorrimento in transazione.

## Requisiti (ciò che manca)

1. "Dov'è?": il dorso si sfila e pulsa; testo "Mobile · ripiano 3 · posto 12"; anche dall'elenco dei libri; anche su telefono.
2. Spostare un libro tra mobili, con trascinamento e da tastiera.
3. Larghezza del dorso modificabile.
4. Scan-a-scaffale su telefono: scegli mobile e ripiano, scansiona in sequenza, annulla l'ultimo, riepilogo finale.
5. Il P3 rimasto dal run 4C1 nel foglio dei filtri della PWA.
