/**
 * coverPrefs.ts — preferenza opt-out per il download automatico delle
 * copertine da Google Books. Persistita in localStorage.
 *
 * Default: abilitato. L'utente puo' disattivare da Impostazioni →
 * Copertine. Quando disabilitato, `BookCover` non chiama mai la rete e
 * mostra il placeholder editoriale.
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'bookeeper:covers:enabled';

function readStored(): boolean {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true; // default: opt-in
    return v === '1';
}

export const useCoverPrefsStore = defineStore('cover-prefs', () => {
    const enabled = ref<boolean>(readStored());

    watch(enabled, (v) => {
        localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    });

    function setEnabled(v: boolean) {
        enabled.value = v;
    }

    return { enabled, setEnabled };
});
