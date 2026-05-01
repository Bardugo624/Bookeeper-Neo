// Bookeeper Neo — UI store: gestisce tema (light/dark/system) persistito.
//
// `system` segue prefers-color-scheme dell'OS. Stato reattivo verifificato
// (l'icona del topbar si aggiorna live al cambio OS), `.dark` viene
// applicato/rimosso su <html>.
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'bookeeper:theme';

export type ThemeMode = 'light' | 'dark' | 'system';

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredMode(): ThemeMode {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function applyDarkClass(dark: boolean) {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export const useUiStore = defineStore('ui', () => {
    const mode = ref<ThemeMode>(readStoredMode());
    // Tracciato come ref reattivo per aggiornare la UI live al cambio OS.
    const systemDark = ref(mediaQuery.matches);

    mediaQuery.addEventListener('change', (e) => {
        systemDark.value = e.matches;
    });

    const isDark = computed(() => (mode.value === 'system' ? systemDark.value : mode.value === 'dark'));

    watch(isDark, applyDarkClass, { immediate: true });
    watch(mode, (m) => localStorage.setItem(STORAGE_KEY, m));

    function setMode(m: ThemeMode) {
        mode.value = m;
    }
    function toggle() {
        // Ciclo: light → dark → system → light…
        mode.value = mode.value === 'light' ? 'dark' : mode.value === 'dark' ? 'system' : 'light';
    }

    return { mode, isDark, systemDark, setMode, toggle };
});
