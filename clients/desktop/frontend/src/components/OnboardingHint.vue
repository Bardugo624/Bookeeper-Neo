<script setup lang="ts">
/**
 * OnboardingHint — segnalibro contestuale one-shot (roadmap 1.4).
 *
 * Un nastro-segnalibro (clip-path con tacca in basso) che "pende" dal bordo
 * superiore della vista la prima volta che l'utente la apre. Si chiude con
 * la X e non torna più (localStorage via useOnboarding). Entrata animata con
 * @starting-style, statico con prefers-reduced-motion.
 */
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useOnboarding, type HintName } from '@/composables/useOnboarding';

const props = defineProps<{
    name: HintName;
    /** Chiave i18n del testo (title + body sotto questa radice). */
    i18nRoot: string;
}>();

const { t } = useI18n();
const onb = useOnboarding();

function dismiss() {
    onb.dismissHint(props.name);
}
</script>

<template>
    <aside
        v-if="onb.showHint(props.name)"
        class="onb-hint"
        role="note"
        :aria-label="t(props.i18nRoot + '.title')"
    >
        <span class="onb-hint__ribbon" aria-hidden="true">
            <i class="pi pi-bookmark-fill"></i>
        </span>
        <div class="onb-hint__body">
            <strong class="onb-hint__title">{{ t(props.i18nRoot + '.title') }}</strong>
            <p class="onb-hint__text">{{ t(props.i18nRoot + '.body') }}</p>
        </div>
        <Button
            text rounded size="small" severity="secondary"
            icon="pi pi-times"
            class="onb-hint__close"
            :aria-label="t('onboarding.hintDismiss')"
            @click="dismiss"
        />
    </aside>
</template>

<style scoped>
.onb-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    margin: 0 0 1.25rem;
    padding: 0.875rem 0.5rem 0.875rem 1rem;
    border: 1px solid color-mix(in oklab, var(--p-primary-500) 30%, transparent);
    border-radius: 10px;
    background: color-mix(in oklab, var(--p-primary-500) 7%, var(--p-surface-0));
    max-width: 68ch;
}

/* Il segnalibro: nastro verticale con tacca a coda di rondine. */
.onb-hint__ribbon {
    display: inline-flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 0.5rem;
    width: 30px;
    height: 46px;
    flex-shrink: 0;
    /* Sporge visivamente dall'alto della card, come infilato tra le pagine */
    margin-top: -1.4rem;
    background: var(--p-primary-600);
    color: var(--p-primary-50);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%);
    box-shadow: 0 2px 6px color-mix(in oklab, var(--p-primary-900) 25%, transparent);
}
.onb-hint__ribbon i {
    font-size: 0.8rem;
}

.onb-hint__body {
    flex: 1;
    min-width: 0;
}
.onb-hint__title {
    display: block;
    font-size: 0.925rem;
    color: var(--p-primary-900);
}
.onb-hint__text {
    margin: 0.2rem 0 0;
    font-size: 0.875rem;
    line-height: 1.45;
    color: var(--p-primary-800);
}
.onb-hint__close {
    flex-shrink: 0;
    margin: -0.25rem 0 0;
}

/* Entrata: cala dall'alto come un segnalibro appoggiato ora. */
@supports (transition-behavior: allow-discrete) {
    .onb-hint {
        transition: opacity 260ms ease-out, transform 320ms cubic-bezier(.16, 1, .3, 1);
        @starting-style {
            opacity: 0;
            transform: translateY(-10px);
        }
    }
}

:global(.dark) .onb-hint {
    background: color-mix(in oklab, var(--p-primary-400) 12%, var(--p-surface-900));
    border-color: color-mix(in oklab, var(--p-primary-400) 35%, transparent);
}
:global(.dark) .onb-hint__title { color: var(--p-primary-100); }
:global(.dark) .onb-hint__text { color: var(--p-primary-200); }

@media (prefers-reduced-motion: reduce) {
    .onb-hint {
        transition: none;
    }
}
</style>
