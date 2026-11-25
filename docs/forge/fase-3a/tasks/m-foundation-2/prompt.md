Leggi prima `docs/forge/fase-3a/CONTRATTO.md` e `docs/forge/fase-2a/CONTRATTO.md`. La task `m-foundation` è già unita. Ogni correzione ha un test che fallisce prima e passa dopo.

# Mobile: tre lacune delle fondamenta

I revisori delle task dei moduli hanno trovato tre cose che mancano nelle fondamenta e che i moduli non possono correggere da soli.

1. **Preferenze di tema e lingua** (`apps/mobile/src/app/theme.ts`, `app/i18n.tsx`). Oggi il tema segue solo il sistema e la lingua solo `navigator.language`. Regola, come nel desktop (leggi `apps/desktop/src/app/i18n.tsx` e il tema del desktop; non importare): preferenza `'system' | 'light' | 'dark'` sotto `bookeeper.theme` e `'system' | 'it' | 'en'` sotto `bookeeper.locale`, lette all'avvio, applicate a tutta l'app, cambiabili senza ricaricare. Esporta `useThemePreference()` e `useLocalePreference()` (`{ value, set }`). In modalità `system` si seguono `prefers-color-scheme` e l'evento `languagechange`; con una scelta esplicita il sistema non la sovrascrive. `<html lang>` segue la lingua. Uno script in linea in `index.html` applica il tema salvato prima del primo disegno.
2. **Link di abbinamento con sessione valida** (`app/SessionGate.tsx`). Oggi, con stato `ready`, ogni rotta pubblica viene portata alla prima scheda: aprendo il QR su un telefono già collegato il codice si perde. Regola: le rotte pubbliche sotto `/pair` restano raggiungibili anche con stato `ready` quando l'indirizzo porta un `code`; senza `code`, `/pair` con sessione valida porta alla prima scheda come oggi.
3. **Richieste binarie** (`session/authTransport.ts`). Il trasporto autenticato non ha `requestRaw`: le copertine non si possono leggere. Regola: `requestRaw` con le stesse regole di `request` (intestazione `Authorization`, un solo rinnovo condiviso su 401 rinnovabile, codice d'errore letto dal corpo anche quando arriva come byte). Leggi come lo fa `apps/desktop/src/session/authTransport.ts`.

Non modificare i moduli sotto `apps/mobile/src/modules/`.

## Test

- Tema: preferenza salvata applicata all'avvio; `system` segue `matchMedia`; con `dark` esplicito un cambio del sistema non la tocca; `useThemePreference().set` cambia subito.
- Lingua: preferenza salvata applicata a tutta l'app; cambio senza ricaricare; `system` segue `languagechange`; `<html lang>`.
- Cancello: `ready` + `/pair?code=X` → la rotta pubblica si monta; `ready` + `/pair` → prima scheda; `unpaired` + rotta protetta → `/pair`.
- `requestRaw`: porta `Authorization`; 401 `token_expired` → un rinnovo e ripetizione; 401 `device_revoked` → `unpaired`; due richieste insieme → un rinnovo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm run build -w @bookeeper/mobile` passano.
- Cambiano solo: `apps/mobile/index.html` e file sotto `apps/mobile/src/{app,session,shell,platform,kit}/`.
