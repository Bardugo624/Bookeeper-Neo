// Bookeeper Mobile — global navigation guard.
//
// Three responsibilities, in this exact order:
//   1. Hydrate the auth store from IndexedDB (once per app boot).
//   2. If the URL has `?pair=<token>` AND the device is unpaired, divert to
//      the pairing splash screen carrying the token in route state. The
//      splash performs `redeemPairingToken` then redirects to /search.
//   3. Otherwise enforce `meta.requiresPaired` → redirect to /pair/required
//      when there are no creds.

import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export function installAuthGuard(router: Router): void {
    router.beforeEach(async (to) => {
        const auth = useAuthStore();
        await auth.hydrate();

        // Step 2: deep-link auto-redeem.
        const pairToken = typeof to.query.pair === 'string' ? to.query.pair : null;
        if (pairToken && !auth.isPaired) {
            // Already on the splash → let it proceed (it reads token from query).
            if (to.name === 'pair-redeeming') return true;
            return {
                name: 'pair-redeeming',
                query: { pair: pairToken },
                replace: true,
            };
        }

        // If the URL still carries ?pair=... but device is already paired
        // (e.g. user reshares the link), strip it cleanly to /search.
        if (pairToken && auth.isPaired && to.name !== 'search') {
            return { name: 'search', replace: true };
        }

        // Step 3: paired guard.
        if (to.meta.requiresPaired && !auth.isPaired) {
            return { name: 'pair-required', replace: true };
        }

        return true;
    });
}
