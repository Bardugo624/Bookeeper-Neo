<script setup lang="ts">
/**
 * UpdateBanner — barra sticky in cima all'AppShell. Tre stati visivi:
 *
 *   1. Available    → tinta sage chiara, CTA "Vedi novità" + "Scarica"
 *   2. Downloading  → progress bar + ETA, dismiss disabilitato
 *   3. Ready        → sage saturo, CTA primaria "Installa e riavvia"
 *
 * Tutto on-brand (palette sage/cream del PrimeVue preset). Animazioni
 * rispettano prefers-reduced-motion.
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useUpdater } from '@/composables/useUpdater';
import UpdateChangelogDialog from './UpdateChangelogDialog.vue';

const updater = useUpdater();
const showChangelog = ref(false);

const progressPct = computed(() => {
    const { downloaded, total } = updater.state.progress;
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((downloaded / total) * 100));
});

const sizeMb = computed(() => {
    const b = updater.state.info?.size_bytes ?? 0;
    return b > 0 ? (b / (1024 * 1024)).toFixed(1) : '?';
});

// ETA basato sulla velocità media degli ultimi ~2s di campioni.
const speedSamples: { t: number; bytes: number }[] = [];
const etaText = ref('');
const speedText = ref('');

watch(
    () => updater.state.progress.downloaded,
    (downloaded) => {
        if (!updater.state.downloading) return;
        const total = updater.state.progress.total;
        const now = performance.now();
        speedSamples.push({ t: now, bytes: downloaded });
        // Mantieni solo ultimi 2s
        while (speedSamples.length > 1 && now - speedSamples[0].t > 2000) {
            speedSamples.shift();
        }
        if (speedSamples.length >= 2) {
            const first = speedSamples[0];
            const last = speedSamples[speedSamples.length - 1];
            const dt = (last.t - first.t) / 1000;
            const dB = last.bytes - first.bytes;
            if (dt > 0.2 && dB > 0) {
                const bps = dB / dt;
                speedText.value = formatSpeed(bps);
                if (total > 0) {
                    const remain = (total - downloaded) / bps;
                    etaText.value = formatEta(remain);
                }
            }
        }
    },
);

watch(
    () => updater.state.downloading,
    (v) => {
        if (!v) {
            speedSamples.length = 0;
            etaText.value = '';
            speedText.value = '';
        }
    },
);

function formatSpeed(bps: number): string {
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bps)} B/s`;
}
function formatEta(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return '';
    if (sec < 60) return `${Math.ceil(sec)}s rimanenti`;
    const m = Math.ceil(sec / 60);
    return `${m} min rimanenti`;
}

function onDismiss() {
    updater.dismiss();
}
</script>

<template>
    <Transition name="banner">
        <div v-if="updater.state.available || updater.state.downloading || updater.state.ready"
             class="update-banner"
             :class="{
                 'update-banner--available': updater.state.available && !updater.state.downloading && !updater.state.ready,
                 'update-banner--downloading': updater.state.downloading,
                 'update-banner--ready': updater.state.ready,
             }"
             role="status" aria-live="polite">
            <span class="update-banner__icon" aria-hidden="true">
                <i class="pi" :class="{
                    'pi-sparkles': updater.state.available && !updater.state.downloading && !updater.state.ready,
                    'pi-cloud-download': updater.state.downloading,
                    'pi-check-circle': updater.state.ready,
                }"></i>
            </span>

            <!-- Stato 1: disponibile -->
            <template v-if="updater.state.available && !updater.state.downloading && !updater.state.ready">
                <div class="update-banner__text">
                    <strong>Bookeeper {{ updater.state.info?.latest }}</strong> è disponibile
                    <span class="update-banner__sub">· {{ sizeMb }} MB</span>
                </div>
                <div class="update-banner__actions">
                    <Button text label="Vedi novità" icon="pi pi-book"
                            @click="showChangelog = true" />
                    <Button label="Scarica" icon="pi pi-download"
                            @click="updater.startDownload()" />
                    <Button text severity="secondary" rounded
                            icon="pi pi-times"
                            aria-label="Ignora questa versione"
                            v-tooltip.bottom="'Ignora questa versione'"
                            @click="onDismiss" />
                </div>
            </template>

            <!-- Stato 2: download in corso -->
            <template v-else-if="updater.state.downloading">
                <div class="update-banner__text">
                    Sto scaricando <strong>Bookeeper {{ updater.state.info?.latest }}</strong>
                    <span v-if="speedText" class="update-banner__sub">
                        · {{ speedText }}<span v-if="etaText"> · {{ etaText }}</span>
                    </span>
                </div>
                <div class="update-banner__progress-wrap">
                    <ProgressBar :value="progressPct" class="update-banner__progress"
                                 :show-value="false" />
                    <span class="update-banner__pct" aria-live="off">{{ progressPct }}%</span>
                </div>
            </template>

            <!-- Stato 3: pronto da installare -->
            <template v-else-if="updater.state.ready">
                <div class="update-banner__text">
                    <strong>Bookeeper {{ updater.state.info?.latest }}</strong> è pronto.
                    L'app si chiuderà per completare l'installazione.
                </div>
                <div class="update-banner__actions">
                    <Button label="Installa e riavvia" icon="pi pi-refresh"
                            @click="updater.installNow()" />
                </div>
            </template>
        </div>
    </Transition>

    <UpdateChangelogDialog v-model:visible="showChangelog"
        :info="updater.state.info"
        @download="updater.startDownload(); showChangelog = false" />
</template>

<style scoped>
/* ============================================================
 * UpdateBanner — palette 100% on-brand sage/cream.
 * Tre stati con gerarchia di emphasis crescente:
 *   available    → cream tinto sage 6%   (low emphasis, info)
 *   downloading  → cream tinto sage 10%  (medium, in corso)
 *   ready        → sage 14% + bordo sage (high emphasis, CTA)
 * Testo sempre primary-900/800 (>=4.5:1 su tutte le tinte).
 * ============================================================ */
.update-banner {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 1.25rem;
    background: color-mix(in oklab, var(--p-primary-500) 6%, var(--p-surface-0));
    color: var(--p-primary-900);
    border-bottom: 1px solid color-mix(in oklab, var(--p-primary-500) 18%, transparent);
    font-size: 0.9rem;
    line-height: 1.35;
    flex-shrink: 0;
    min-height: 56px;        /* respiro + touch target consistente */
}

.update-banner__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--p-primary-500) 18%, transparent);
    color: var(--p-primary-700);
    flex-shrink: 0;
}
.update-banner__icon i {
    font-size: 1rem;
}

.update-banner__text {
    flex: 1;
    min-width: 0;
}
.update-banner__sub {
    color: var(--p-primary-700);   /* tinta brand, non opacita' su brand */
    font-weight: 400;
    margin-left: 0.15rem;
    font-variant-numeric: tabular-nums;
}
.update-banner__actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
}

/* Progress bar group: bar + pct fianco-a-fianco, non si deforma */
.update-banner__progress-wrap {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
    width: clamp(220px, 38vw, 360px);
}
.update-banner__progress {
    flex: 1;
    height: 6px !important;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in oklab, var(--p-primary-500) 14%, var(--p-surface-0)) !important;
}
.update-banner__progress :deep(.p-progressbar-value) {
    background: var(--p-primary-500) !important;
    transition: width 200ms ease-out;
}
.update-banner__pct {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    min-width: 3.5ch;
    text-align: right;
    color: var(--p-primary-800);
}

/* === Stato available: lo stato base e' gia' "available". === */

/* === Stato downloading: leggermente piu' tinto, no actions === */
.update-banner--downloading {
    background: color-mix(in oklab, var(--p-primary-500) 10%, var(--p-surface-0));
    border-bottom-color: color-mix(in oklab, var(--p-primary-500) 28%, transparent);
}

/* === Stato ready: piu' saturo, segnala CTA prioritaria === */
.update-banner--ready {
    background: color-mix(in oklab, var(--p-primary-500) 14%, var(--p-surface-0));
    border-bottom-color: color-mix(in oklab, var(--p-primary-500) 40%, transparent);
}
.update-banner--ready .update-banner__icon {
    background: var(--p-primary-500);
    color: var(--p-primary-50);
}

/* === Dark mode: usa tonali, non invertiti (HIG/MD color-dark-mode) === */
:global(.dark) .update-banner {
    background: color-mix(in oklab, var(--p-primary-500) 14%, var(--p-surface-800));
    color: var(--p-primary-100);
    border-bottom-color: color-mix(in oklab, var(--p-primary-500) 35%, transparent);
}
:global(.dark) .update-banner__sub,
:global(.dark) .update-banner__pct {
    color: var(--p-primary-200);
}
:global(.dark) .update-banner__icon {
    background: color-mix(in oklab, var(--p-primary-400) 25%, transparent);
    color: var(--p-primary-200);
}
:global(.dark) .update-banner--ready .update-banner__icon {
    background: var(--p-primary-400);
    color: var(--p-primary-950);
}

/* === Animazione entrata/uscita: spring-like, breve === */
.banner-enter-active {
    transition: transform 280ms cubic-bezier(.2, .9, .25, 1.1),
                opacity   220ms ease-out;
}
.banner-leave-active {
    transition: transform 180ms ease-in, opacity 160ms ease-in;
}
.banner-enter-from,
.banner-leave-to {
    transform: translateY(-100%);
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .banner-enter-active,
    .banner-leave-active {
        transition: opacity 120ms ease;
    }
    .banner-enter-from,
    .banner-leave-to {
        transform: none;
    }
    .update-banner__progress :deep(.p-progressbar-value) {
        transition: none;
    }
}

/* === Responsive: a < 720px le actions vanno a capo === */
@media (max-width: 720px) {
    .update-banner {
        flex-wrap: wrap;
        padding: 0.75rem 1rem;
    }
    .update-banner__actions {
        order: 3;
        flex-basis: 100%;
        justify-content: flex-end;
    }
    .update-banner__progress-wrap {
        width: 100%;
        order: 3;
    }
}
</style>
