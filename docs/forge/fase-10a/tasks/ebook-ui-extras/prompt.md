Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. Le task del core sono già unite: usa `packages/api`.

# Computer: registro attività e nota sul backup

## File
- `apps/desktop/src/modules/settings/sections/audit/` e `apps/desktop/src/modules/settings/sections/backup/`.
- `packages/i18n/src/locales/{it,en}/audit.json` e `backup.json`.

## Cosa fare
1. **Registro attività:** `book.file.add` diventa «ha aggiunto il file EPUB a «Titolo»», e `book.file.remove` «ha tolto il file … da «Titolo»». Il titolo porta al libro, come le voci esistenti; il formato viene dal dettaglio.
2. **Nella sezione Backup** una nota breve:
   - gli e-book non sono nell'archivio, che ne elenca soltanto i nomi;
   - per conservarli si copia la cartella `ebooks` dei dati;
   - siccome i file non cambiano mai, basta copiare quelli nuovi.

## Test
- Le due voci del registro, con il link al libro.
- La nota nella sezione Backup.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/desktop` passa.
- `npx vitest run src/modules/settings src/kit/translationKeys.test.ts` (da `apps/desktop`) passa.
- `impeccable detect --json` pulito sui file cambiati.
