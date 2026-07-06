<script setup lang="ts">
/**
 * FirstBookCelebration — il momento "aha" dopo il PRIMO libro (roadmap 1.4).
 *
 * Niente confetti: siamo una biblioteca, non un casinò. La celebrazione è
 * una mensola che si popola — dorsi stilizzati che scivolano al loro posto
 * uno dopo l'altro (WAAPI-free: keyframes CSS con stagger), con il "tuo"
 * libro evidenziato. Poi due next-step concreti: scaffale e import.
 */
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const { t } = useI18n();
const router = useRouter();

// Mensola decorativa: larghezze/tinte fisse (deterministiche, niente flicker
// al re-render). Il 4° dorso è "il tuo": più alto, tinta primaria piena.
// `lean`: il libro appoggiato in pendenza è quello che trasforma una fila di
// rettangoli in una mensola (senza, leggerebbe come un grafico a barre).
const spines = [
    { w: 14, h: 58, tone: 'a', lean: 0 }, { w: 20, h: 66, tone: 'b', lean: 0 },
    { w: 12, h: 52, tone: 'c', lean: -14 }, { w: 22, h: 78, tone: 'you', lean: 0 },
    { w: 16, h: 62, tone: 'b', lean: 0 }, { w: 13, h: 56, tone: 'a', lean: 10 },
    { w: 18, h: 64, tone: 'c', lean: 0 },
];

function goShelves() {
    emit('update:visible', false);
    void router.push({ name: 'shelves' });
}
function goImport() {
    emit('update:visible', false);
    void router.push({ path: '/settings', query: { tab: 'data' } });
}
</script>

<template>
    <Dialog
        :visible="visible"
        modal
        :dismissable-mask="true"
        :show-header="false"
        :style="{ width: 'min(440px, 92vw)' }"
        content-class="firstbook__content"
        @update:visible="emit('update:visible', $event)"
    >
        <div class="firstbook">
            <div class="firstbook__shelf" aria-hidden="true">
                <div class="firstbook__books">
                    <span
                        v-for="(s, i) in spines"
                        :key="i"
                        class="firstbook__spine"
                        :class="'firstbook__spine--' + s.tone"
                        :style="{
                            width: s.w + 'px',
                            height: s.h + 'px',
                            animationDelay: (i * 90) + 'ms',
                            '--spine-lean': s.lean + 'deg',
                        }"
                    />
                </div>
                <div class="firstbook__plank"></div>
            </div>

            <h2 class="firstbook__title">{{ t('onboarding.celebration.title') }}</h2>
            <p class="firstbook__text">{{ t('onboarding.celebration.body') }}</p>

            <div class="firstbook__actions">
                <Button
                    :label="t('onboarding.celebration.ctaShelf')"
                    icon="pi pi-table"
                    @click="goShelves"
                />
                <Button
                    :label="t('onboarding.celebration.ctaImport')"
                    icon="pi pi-file-import"
                    severity="secondary" outlined
                    @click="goImport"
                />
            </div>
            <Button
                text size="small" severity="secondary"
                :label="t('onboarding.celebration.later')"
                class="firstbook__later"
                @click="emit('update:visible', false)"
            />
        </div>
    </Dialog>
</template>

<style scoped>
.firstbook {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem 0.5rem 0.5rem;
}

/* --- La mensola --- */
.firstbook__shelf {
    width: 200px;
    margin-bottom: 1.5rem;
}
.firstbook__books {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 3px;
    min-height: 80px;
}
.firstbook__spine {
    border-radius: 2px 2px 0 0;
    animation: spine-in 480ms cubic-bezier(.16, 1, .3, 1) backwards;
    transform-origin: bottom center;
    transform: rotate(var(--spine-lean, 0deg));
}
.firstbook__spine--a { background: color-mix(in oklab, var(--p-primary-500) 45%, var(--p-surface-300)); }
.firstbook__spine--b { background: color-mix(in oklab, var(--p-primary-700) 55%, var(--p-surface-400)); }
.firstbook__spine--c { background: color-mix(in oklab, var(--p-primary-300) 60%, var(--p-surface-200)); }
.firstbook__spine--you {
    background: var(--p-primary-600);
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--p-primary-500) 55%, transparent);
    animation:
        spine-in 480ms cubic-bezier(.16, 1, .3, 1) backwards,
        spine-glow 1.6s ease-out 800ms 1;
}
.firstbook__plank {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(180deg,
        color-mix(in oklab, var(--p-primary-900) 55%, var(--p-surface-500)),
        color-mix(in oklab, var(--p-primary-900) 35%, var(--p-surface-600)));
    box-shadow: 0 3px 8px color-mix(in oklab, var(--p-primary-900) 22%, transparent);
}

@keyframes spine-in {
    from {
        opacity: 0;
        transform: translateY(-26px) rotate(calc(var(--spine-lean, 0deg) - 4deg));
    }
    60% {
        opacity: 1;
    }
    to {
        opacity: 1;
        transform: translateY(0) rotate(var(--spine-lean, 0deg));
    }
}
@keyframes spine-glow {
    0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--p-primary-500) 55%, transparent); }
    100% { box-shadow: 0 0 0 14px transparent; }
}

.firstbook__title {
    margin: 0 0 0.5rem;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--p-text-color);
    text-wrap: balance;
}
.firstbook__text {
    margin: 0 0 1.5rem;
    max-width: 34ch;
    line-height: 1.5;
    color: var(--p-text-color);
}
.firstbook__actions {
    display: flex;
    gap: 0.625rem;
    flex-wrap: wrap;
    justify-content: center;
}
.firstbook__later {
    margin-top: 0.75rem;
}

@media (prefers-reduced-motion: reduce) {
    .firstbook__spine,
    .firstbook__spine--you {
        animation: none;
    }
}
</style>
