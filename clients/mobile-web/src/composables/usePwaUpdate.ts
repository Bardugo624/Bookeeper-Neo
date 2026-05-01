// Bookeeper Mobile — PWA update prompt composable.
//
// vite-plugin-pwa exposes a `virtual:pwa-register` module that returns an
// `updateSW` function and registers the SW. We use the bare (non-vue) entry
// so we can drive a custom Vue 3 ref without pulling the optional adapter.
//
// Flow:
//   1. SW is installed + activates on first visit (clientsClaim()).
//   2. When a newer SW finishes installing and is waiting, `onNeedRefresh`
//      fires → we set `needsRefresh = true`.
//   3. UI shows a banner ("Aggiornamento disponibile · Ricarica"). Tap calls
//      `applyUpdate()` which posts `SKIP_WAITING` and reloads.
//
// We intentionally avoid auto-skipWaiting on every visit so the user is not
// surprised by a tab reload mid-task (HIG: never reset state silently).

import { ref } from 'vue';
import { registerSW } from 'virtual:pwa-register';

const needsRefresh = ref(false);
const offlineReady = ref(false);
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function initPwaUpdate(): void {
    if (updateSW) return; // already registered
    updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            needsRefresh.value = true;
        },
        onOfflineReady() {
            offlineReady.value = true;
            // Auto-clear after 4s; the message is informational.
            window.setTimeout(() => {
                offlineReady.value = false;
            }, 4000);
        },
        onRegisterError(err) {
            // Non-fatal: SW failure should not break the app.
            // eslint-disable-next-line no-console
            console.warn('[pwa] sw register error', err);
        },
    });
}

export function usePwaUpdate(): {
    needsRefresh: typeof needsRefresh;
    offlineReady: typeof offlineReady;
    applyUpdate: () => Promise<void>;
    dismissUpdate: () => void;
} {
    return {
        needsRefresh,
        offlineReady,
        async applyUpdate(): Promise<void> {
            if (!updateSW) return;
            // `true` reloads the page once the new SW takes control.
            await updateSW(true);
        },
        dismissUpdate(): void {
            needsRefresh.value = false;
        },
    };
}
