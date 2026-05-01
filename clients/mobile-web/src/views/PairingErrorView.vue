<script setup lang="ts">
/**
 * Terminal pairing error. Reached when the redeem call fails (token expired,
 * already used, network error, server CA locked).
 *
 * UX: explicit cause + clear recovery path ("rigenera QR sul desktop e
 * riapri il link"). No retry button here — the token is one-shot, retrying
 * the same one is futile.
 */
import { computed } from 'vue';
import Button from 'primevue/button';

const reason = (history.state?.reason as string | undefined) ?? '';

const friendly = computed(() => {
    const s = reason.toLowerCase();
    if (s.includes('token already used')) {
        return {
            title: 'QR già utilizzato',
            body: 'Questo codice è stato usato per abbinare un altro dispositivo. Genera un nuovo QR sul desktop.',
        };
    }
    if (s.includes('token expired')) {
        return {
            title: 'QR scaduto',
            body: 'Il codice è valido per 10 minuti. Genera un nuovo QR sul desktop e riapri il link.',
        };
    }
    if (s.includes('invalid token')) {
        return {
            title: 'QR non valido',
            body: 'Il codice non è riconosciuto. Genera un nuovo QR sul desktop.',
        };
    }
    if (s.includes('tenant ca locked')) {
        return {
            title: 'Server non pronto',
            body: 'Apri Bookeeper sul desktop almeno una volta per sbloccare le chiavi del server, poi riprova.',
        };
    }
    if (s.startsWith('0:') || s.includes('network')) {
        return {
            title: 'Connessione assente',
            body: 'Verifica di essere sulla rete giusta e riapri il link dal QR.',
        };
    }
    return {
        title: 'Abbinamento non riuscito',
        body: 'Si è verificato un errore imprevisto. Riprova generando un nuovo QR sul desktop.',
    };
});
</script>

<template>
    <main class="error" role="alert" aria-live="assertive">
        <div class="error__card">
            <span class="error__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </span>
            <h1 class="error__title">{{ friendly.title }}</h1>
            <p class="error__body">{{ friendly.body }}</p>
            <Button
                label="Capito"
                severity="secondary"
                outlined
                class="error__cta"
                @click="$router.replace({ name: 'pair-required' })"
            />
            <p v-if="reason" class="error__detail">
                Dettaglio: <code>{{ reason }}</code>
            </p>
        </div>
    </main>
</template>

<style scoped>
.error {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: var(--p-surface-50);
    min-height: 100dvh;
}

.error__card {
    width: 100%;
    max-width: 28rem;
    background: var(--p-surface-0);
    border-radius: 16px;
    padding: 2rem 1.5rem 1.5rem;
    text-align: center;
    border: 1px solid var(--p-surface-200);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06);
    animation: error-enter 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.error__icon {
    display: inline-flex;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--p-red-500) 12%, transparent);
    color: var(--p-red-600);
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
}

.error__icon svg {
    width: 28px;
    height: 28px;
}

.error__title {
    margin: 0 0 0.5rem;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.35rem;
    color: var(--p-text-color);
}

.error__body {
    margin: 0 0 1.5rem;
    color: var(--p-text-muted-color);
    line-height: 1.55;
}

.error__cta {
    width: 100%;
    min-height: 44px;
}

.error__detail {
    margin: 1rem 0 0;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    word-break: break-word;
}

.error__detail code {
    background: var(--p-surface-100);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

@keyframes error-enter {
    from {
        opacity: 0;
        transform: scale(0.96);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

@media (prefers-reduced-motion: reduce) {
    .error__card {
        animation: none;
    }
}
</style>
