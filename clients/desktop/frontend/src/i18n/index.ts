/**
 * i18n — vue-i18n (Composition API) con rilevamento lingua e persistenza.
 *
 * Modalità: 'it' | 'en' | 'system' (default). 'system' segue
 * navigator.language: italiano → it, tutto il resto → en.
 * La scelta è persistita in localStorage e si applica live (nessun reload).
 *
 * Migrazione incrementale: il fallback è 'it' e le viste non ancora
 * estratte restano hardcoded in italiano — l'app funziona identica,
 * la copertura inglese cresce vista per vista.
 */
import { createI18n } from 'vue-i18n';
import it from './it.json';
import en from './en.json';

const STORAGE_KEY = 'bookeeper:locale';

export type LocaleMode = 'it' | 'en' | 'system';
export type Locale = 'it' | 'en';

export function readLocaleMode(): LocaleMode {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'it' || v === 'en' || v === 'system' ? v : 'system';
}

function resolve(mode: LocaleMode): Locale {
    if (mode !== 'system') return mode;
    return (navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en';
}

export const i18n = createI18n({
    legacy: false,
    locale: resolve(readLocaleMode()),
    fallbackLocale: 'it',
    messages: { it, en },
});

/** Cambia lingua (persistita) e la applica immediatamente. */
export function setLocaleMode(mode: LocaleMode) {
    localStorage.setItem(STORAGE_KEY, mode);
    i18n.global.locale.value = resolve(mode);
}
