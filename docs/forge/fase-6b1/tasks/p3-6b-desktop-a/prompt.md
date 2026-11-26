Leggi prima `docs/forge/fase-6b1/CONTRATTO.md`, `docs/forge/fase-6b/CONTRATTO.md` e `docs/forge/fase-6a/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo. La task `ui-icons` è già unita. Leggi `apps/desktop/src/modules/people` per intero, `apps/desktop/src/modules/devices/CodeBlock.tsx` e `apps/desktop/src/modules/settings/sections/notifications`.

# Desktop: persone e notifiche

1. **Scadenza dell'invito** (`people/InviteDialog.tsx`): `CodeBlock` mostra il tempo restante in minuti e secondi, così un invito di 7 giorni dice "Scade tra 10079:59". Regola: per un invito si mostra la data, "Scade il 3 dic 2026". Aggiungi a `CodeBlock` una proprietà facoltativa che sostituisce il conto alla rovescia con un testo dato; senza di essa `CodeBlock` resta com'è per i dispositivi.
2. **Istruzioni senza QR** (`InviteDialog.tsx`): "Sul telefono: inquadra il QR" compare anche quando il QR non c'è. Regola: con il QR, le due istruzioni di oggi; senza, solo quella del computer e la frase "Per entrare dal telefono serve un server con un indirizzo HTTPS."
3. **Nome del ruolo**: `audit.json` e `people.json` (it) chiamano l'admin "amministratore" (per esempio `people.owner.effects.2`, "Tu diventi amministratore."). Regola del contratto 6B: "Admin". Correggi ogni occorrenza nei due file; in inglese "admin" resta. Adegua le frasi attese in `apps/desktop/src/modules/settings/sections/audit/audit.test.tsx` che citano "amministratore" o "amministratori".
4. **Icone**: la voce "Persone" della barra laterale usa `users`; la sezione "Notifiche" delle impostazioni usa `bell`.
5. **Permesso non ancora noto** (`settings/sections/notifications/useNotifications.ts`, circa riga 28): l'interruttore si può accendere prima che lo stato del permesso sia letto, e allora il permesso non viene chiesto. Regola: finché lo stato non è noto, l'interruttore è disattivato con lo stato di caricamento; poi vale la regola di oggi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/desktop/src/modules/people/`, `apps/desktop/src/modules/devices/CodeBlock.tsx`, il suo foglio di stile e un test nuovo `CodeBlock.test.tsx`, file sotto `apps/desktop/src/modules/settings/sections/notifications/`, i file i18n `people.json`, `audit.json`, `notifications.json` e `devices.json` (it e en), `apps/desktop/src/modules/settings/sections/audit/audit.test.tsx` (solo le frasi attese).
