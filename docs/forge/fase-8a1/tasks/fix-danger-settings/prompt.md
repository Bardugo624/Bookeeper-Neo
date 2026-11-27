Leggi prima `docs/forge/fase-8a1/CONTRATTO.md`. La task `fix-kit-danger` è già unita: il contenuto messo direttamente in una `DangerZone` ha il suo respiro.

# Impostazioni: il ripristino nella zona pericolosa, testi e resti

1. **[P3 + visto nel browser]** `apps/desktop/src/modules/settings/sections/backup/RestoreBlock.tsx`: nella zona il selettore del file sta **sopra** la descrizione dell'azione, attaccato al contorno; si legge prima «Scegli un file» e poi cosa fa. L'azione «Ripristina da file» viene prima, con la sua conseguenza; il selettore del file, l'errore e il resoconto stanno dentro quella stessa azione, sotto il testo. Il bottone pericoloso disabilitato (nessun file scelto) deve restare leggibile (contrasto del testo ≥ 4,5:1 anche disabilitato, oppure una riga che dice cosa manca).
2. **[P3]** Nella conseguenza del ripristino sono spariti due testi del vecchio avviso: che lo può fare solo il proprietario, e che i dati che non sono nel backup andranno persi. Rimettili nella conseguenza (italiano e inglese), in frasi brevi.
3. **[P3]** Resti non più usati: gli stili `.warning` di `BackupSection.module.css` e i testi `backup.restore.title`, `backup.restore.description`, `backup.restore.warning` (`backup.json`), e `settings.account.signOut.title` e `.description` (`settings.json`), se nessun componente li usa più. Toglili, in italiano e in inglese.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/settings src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Cambiano solo `apps/desktop/src/modules/settings/sections/backup/`, `apps/desktop/src/modules/settings/sections/account/`, i test delle impostazioni in `apps/desktop/src/modules/settings/` che le riguardano, e `backup.json`, `settings.json` (it, en).
