Leggi prima `docs/forge/fase-9c/CONTRATTO.md` («Le citazioni», «Cose che più facilmente farebbero male») e il design `docs/superpowers/specs/2026-11-27-pagina-apertura-design.md` («Cosa vuol dire verificata», «I dati»).

# Citazioni verificate: il generatore e il file condiviso

## File
- Crea `scripts/quotes.mjs` e `scripts/quotes.test.mjs`.
- Crea il file generato `packages/ui/src/quote/quotes.json`.
- NON toccare `scripts/setup/quotes.mjs` né `apps/setup/src/quotes.json`: li toglie la task `quote-setup`.

## Interfacce prodotte
- `packages/ui/src/quote/quotes.json` con la forma del contratto: `[{ id, it: { text, author, work } | null, en: … | null }]`.
- Da `scripts/quotes.mjs`, per i test:
  - `typeset(text)`, le cinque sostituzioni del contratto, in ordine;
  - `isVerified(quote, lang)`;
  - `buildQuotes(quotes, choices)`, pura;
  - `render(quotes, choices)`, il testo del file;
  - `generate({ citazioni, scelte, out })`;
  - `DEFAULT_PATHS`;
  - le tabelle `AUTHORS` e `WORKS`.
- Il file si genera con `node scripts/quotes.mjs`.

## Cosa fare
- **Lingue:** per ogni citazione e lingua, il testo entra solo se verificato. È `confidence === "high"` e `checked[lang] === true`, e la citazione non è segnata `scarta`.
- **Testo:** passa da `typeset`; le parole restano quelle della fonte.
- **Autore:** `AUTHORS[id][lang]` se c'è, altrimenti il campo `author`.
- **Opera:** `WORKS[id]` se la chiave c'è (anche `null`), altrimenti `work` fino alla prima ` (`.
- **Didascalie:** autore e opera ricevono solo la sostituzione 1 (`'` diventa `’`).
- **Uscita:** il file ordinato per `id`, con rientro di 2 spazi e `\n` in fondo, come il generatore di oggi.

## Test
`node --test scripts/quotes.test.mjs`, con file di prova in una cartella temporanea:

- **Verifica per lingua:**
  - verificata solo in italiano dà `en: null`;
  - `confidence: "medium"` è esclusa;
  - `scarta` è esclusa anche se verificata;
  - `tieni` non cambia niente.
- **`typeset`:** ogni sostituzione da sola, sui casi del contratto (`'`, `...`, «», ` / `, ` - `, ` -` in fondo).
- **Didascalie:**
  - le cinque voci di `AUTHORS`;
  - `WORKS` con `null` dà la didascalia senza opera;
  - `84, Charing Cross Road` resta intero.
- **Completezza:** sul file vero, ogni voce verificata il cui `work`, tagliato alla prima ` (`, contiene `, `, `: ` o `«` ha una voce in `WORKS`. Ogni `author` con `(` ha una voce in `AUTHORS`.
- **Parole intatte:** per ogni testo del file vero, la sorgente e il testo generato coincidono dopo una normalizzazione che porta le due forme di ogni sostituzione alla stessa. Per esempio `’` e `'` diventano `'`, `“` e `«` diventano `«`, `\n` e ` / ` diventano ` / `.
- **Conteggi sul file vero:** 80 testi in italiano e 48 in inglese.
- **Il file nel repository** coincide con quello che `render` produce oggi.

## Acceptance criteria
- `node --test scripts/quotes.test.mjs` passa, e `npm run test:scripts` resta verde.
- Cambiano solo i file dichiarati.
