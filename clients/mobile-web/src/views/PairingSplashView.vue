<script setup lang="ts">
/**
 * Splash screen during /pairing/redeem. UX spec (Phase B):
 *
 * - Centered logo + indeterminate progress; no text spinner first 200ms (most
 *   redemptions complete in < 400ms on LAN, blocking message would flicker).
 * - At t > 600ms show "Connessione in corso..." for perceived progress.
 * - On success → 1s success state ("Connesso") → router.push('/search').
 * - On error → router.replace('/pair/error', state: { reason }).
 *
 * This component runs once per app session. The token is consumed (one-shot)
 * and the URL is rewritten without the `pair` query param so a refresh
 * doesn't re-trigger this view.
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { redeemPairingToken } from '@/lib/pairing';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

type Phase = 'idle' | 'connecting' | 'success' | 'error';
const phase = ref<Phase>('idle');
const slowMessage = ref(false);

onMounted(async () => {
    const token = typeof route.query.pair === 'string' ? route.query.pair : null;
    if (!token) {
        router.replace({ name: 'pair-error', state: { reason: 'missing-token' } });
        return;
    }

    phase.value = 'connecting';
    const slowTimer = window.setTimeout(() => (slowMessage.value = true), 600);

    try {
        const result = await redeemPairingToken(token);
        auth.setPaired(result.deviceId, result.deviceName);
        phase.value = 'success';
        // Brief success state for spatial continuity, then enter the app.
        window.setTimeout(() => router.replace({ name: 'search' }), 900);
    } catch (err) {
        const reason = err instanceof ApiError ? `${err.status}: ${err.body}` : String(err);
        router.replace({
            name: 'pair-error',
            state: { reason },
        });
    } finally {
        window.clearTimeout(slowTimer);
    }
});
</script>

<template>
    <main
        class="splash"
        role="status"
        aria-live="polite"
        :aria-label="phase === 'success' ? 'Connesso' : 'Connessione in corso'"
    >
        <div class="splash__stage" :data-phase="phase">
            <svg
                class="splash__mark"
                viewBox="0 0 64 64"
                aria-hidden="true"
            >
                <rect class="splash__mark-bg" width="64" height="64" rx="14" />
                <path
                    class="splash__mark-book"
                    d="M16 14h26a6 6 0 0 1 6 6v30H22a6 6 0 0 1-6-6V14z"
                />
                <path
                    class="splash__mark-shelf"
                    d="M16 44a6 6 0 0 1 6-6h26"
                />
                <path
                    v-if="phase === 'success'"
                    class="splash__check"
                    d="M22 32 l8 8 l14 -16"
                />
            </svg>

            <div class="splash__indicator" :aria-hidden="phase === 'success'">
                <div class="splash__bar"><span /></div>
            </div>

            <p class="splash__title">Bookeeper</p>
            <p class="splash__subtitle">
                <template v-if="phase === 'success'">Connesso</template>
                <template v-else-if="slowMessage">Connessione in corso&hellip;</template>
                <template v-else>&nbsp;</template>
            </p>
        </div>
    </main>
</template>

<style scoped>
.splash {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: linear-gradient(
        180deg,
        var(--p-surface-50) 0%,
        var(--p-surface-100) 100%
    );
    min-height: 100dvh;
}

.splash__stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    /* Subtle entrance: fade + lift, motion-meaning = "loading state arrives". */
    animation: splash-enter 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.splash__mark {
    width: 96px;
    height: 96px;
    transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.splash__stage[data-phase='success'] .splash__mark {
    /* Confirmation pop: subtle scale-up = "done". */
    transform: scale(1.06);
}

.splash__mark-bg {
    fill: var(--p-primary-700);
}

.splash__mark-book,
.splash__mark-shelf {
    fill: none;
    stroke: var(--p-primary-50);
    stroke-width: 3;
    stroke-linejoin: round;
    stroke-linecap: round;
}

.splash__check {
    fill: none;
    stroke: var(--p-primary-50);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    animation: splash-check 320ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.splash__indicator {
    width: 100%;
    max-width: 220px;
    height: 4px;
    display: grid;
    place-items: center;
    transition: opacity 200ms ease;
}

.splash__stage[data-phase='success'] .splash__indicator {
    opacity: 0;
}

.splash__bar {
    width: 100%;
    height: 100%;
    background: var(--p-primary-100);
    border-radius: 2px;
    overflow: hidden;
    position: relative;
}

.splash__bar > span {
    position: absolute;
    inset: 0;
    display: block;
    background: var(--p-primary-500);
    border-radius: 2px;
    transform-origin: left center;
    animation: splash-progress 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.splash__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--p-primary-700);
    letter-spacing: -0.01em;
}

.splash__subtitle {
    margin: 0;
    min-height: 1.4em;
    font-size: 0.95rem;
    color: var(--p-text-muted-color);
    text-align: center;
    transition: color 200ms ease;
}

.splash__stage[data-phase='success'] .splash__subtitle {
    color: var(--p-primary-700);
    font-weight: 600;
}

@keyframes splash-enter {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes splash-progress {
    0% {
        transform: translateX(-60%) scaleX(0.4);
    }
    50% {
        transform: translateX(20%) scaleX(0.6);
    }
    100% {
        transform: translateX(140%) scaleX(0.4);
    }
}

@keyframes splash-check {
    to {
        stroke-dashoffset: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .splash__stage,
    .splash__bar > span,
    .splash__check {
        animation: none !important;
    }
    .splash__bar > span {
        transform: none;
    }
}
</style>
