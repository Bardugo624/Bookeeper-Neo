// Bookeeper Mobile — auth store. Mirrors the desktop pattern: setup-style
// Pinia store hydrating from the IndexedDB keystore on app boot, exposing
// `isPaired`, `deviceName`, and a `wipe()` action.

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keystore } from '@/lib/keystore';

export const useAuthStore = defineStore('auth', () => {
    const deviceId = ref<string | null>(null);
    const deviceName = ref<string | null>(null);
    const certFingerprint = ref<string | null>(null);
    const pairedAt = ref<number | null>(null);
    const hydrated = ref(false);

    const isPaired = computed(() => deviceId.value !== null);

    async function hydrate(): Promise<void> {
        if (hydrated.value) return;
        const creds = await keystore.load();
        if (creds) {
            deviceId.value = creds.deviceId;
            deviceName.value = creds.deviceName;
            certFingerprint.value = creds.certFingerprint;
            pairedAt.value = creds.pairedAt;
        }
        hydrated.value = true;
    }

    /** Set after a successful pairing redemption. */
    function setPaired(id: string, name: string): void {
        deviceId.value = id;
        deviceName.value = name;
        pairedAt.value = Date.now();
        // certFingerprint is already in IndexedDB at this point — re-hydrate
        // from the keystore so subsequent api.ts calls see it without
        // requiring the caller to thread it through.
        void keystore.load().then((c) => {
            if (c) certFingerprint.value = c.certFingerprint;
        });
    }

    async function rename(name: string): Promise<void> {
        await keystore.updateName(name);
        deviceName.value = name;
    }

    async function wipe(): Promise<void> {
        await keystore.wipe();
        deviceId.value = null;
        deviceName.value = null;
        certFingerprint.value = null;
        pairedAt.value = null;
    }

    return {
        deviceId,
        deviceName,
        certFingerprint,
        pairedAt,
        hydrated,
        isPaired,
        hydrate,
        setPaired,
        rename,
        wipe,
    };
});
