/**
 * useOnboarding — stato del primo avvio (roadmap 1.4).
 *
 * Tutto client-side in localStorage: l'onboarding è per-dispositivo e non
 * merita round-trip. Tre pezzi:
 *   - firstBook: il flusso guidato "aggiungi il tuo primo libro" nella vista
 *     Libri (empty state speciale + celebrazione alla prima aggiunta);
 *   - hints: i segnalibri contestuali one-shot (scaffali, prestiti);
 *   - dismiss esplicito ("salta") che riporta all'empty state normale.
 *
 * Guardia anti-fastidio: se l'utente ha già libri (import, restore, secondo
 * dispositivo) il primo-libro si auto-completa in silenzio.
 */
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'bookeeper:onboarding';

export type HintName = 'shelves' | 'loans';

interface OnboardingState {
    firstBookDone: boolean;
    skipped: boolean;
    hints: Record<HintName, boolean>; // true = già visto/chiuso
}

function load(): OnboardingState {
    const fallback: OnboardingState = {
        firstBookDone: false,
        skipped: false,
        hints: { shelves: false, loans: false },
    };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return {
            firstBookDone: !!parsed.firstBookDone,
            skipped: !!parsed.skipped,
            hints: {
                shelves: !!parsed.hints?.shelves,
                loans: !!parsed.hints?.loans,
            },
        };
    } catch {
        return fallback;
    }
}

const state = reactive<OnboardingState>(load());

watch(state, (s) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* storage pieno/negato: l'onboarding si ripresenterà, pazienza */ }
});

export function useOnboarding() {
    return {
        state,
        /** Empty state guidato in Libri: mai aggiunto un libro né saltato. */
        showFirstBook(): boolean {
            return !state.firstBookDone && !state.skipped;
        },
        /** Da chiamare quando il PRIMO libro viene creato a mano. */
        completeFirstBook() {
            state.firstBookDone = true;
        },
        /** Libri già presenti (import/restore/altro device): niente onboarding. */
        autoComplete() {
            if (!state.firstBookDone) state.firstBookDone = true;
        },
        skip() {
            state.skipped = true;
        },
        showHint(name: HintName): boolean {
            // I segnalibri hanno senso solo dopo il primo libro: prima
            // l'attenzione deve stare sul flusso guidato.
            return (state.firstBookDone || state.skipped) && !state.hints[name];
        },
        dismissHint(name: HintName) {
            state.hints[name] = true;
        },
    };
}
