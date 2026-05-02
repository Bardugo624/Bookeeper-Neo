<script setup lang="ts">
/**
 * UpdateBanner — barra sticky in cima all'AppShell quando è disponibile
 * (o pronto da installare) un aggiornamento. Tre stati visivi distinti:
 *
 *   1. Available  → cream banner con CTA "Vedi novità" + "Scarica"
 *   2. Downloading → progress bar live (Wails events)
 *   3. Ready      → sage banner con CTA "Installa e riavvia"
 *
 * Il dialog del changelog è un componente separato (UpdateChangelogDialog)
 * montato qui inline per evitare prop drilling.
 */
import { computed, ref } from 'vue';
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

function onDismiss() {
    updater.dismiss();
}
</script>

<template>
    <div v-if="updater.state.available || updater.state.downloading || updater.state.ready"
         class="update-banner"
         :class="{
             'update-banner--ready': updater.state.ready,
             'update-banner--downloading': updater.state.downloading,
         }"
         role="status" aria-live="polite">
        <i class="pi"
           :class="updater.state.ready ? 'pi-check-circle' : 'pi-arrow-circle-down'"
           aria-hidden="true"></i>

        <!-- Stato 1: disponibile -->
        <template v-if="updater.state.available && !updater.state.downloading && !updater.state.ready">
            <span class="update-banner__text">
                <strong>Bookeeper {{ updater.state.info?.latest }}</strong> è disponibile
                <span class="update-banner__sub">({{ sizeMb }} MB)</span>
            </span>
            <div class="update-banner__actions">
                <Button text size="small" label="Vedi novità"
                        icon="pi pi-list" @click="showChangelog = true" />
                <Button size="small" label="Scarica" icon="pi pi-download"
                        @click="updater.startDownload()" />
                <Button text size="small" severity="secondary"
                        icon="pi pi-times" aria-label="Ignora questa versione"
                        @click="onDismiss" />
            </div>
        </template>

        <!-- Stato 2: download in corso -->
        <template v-else-if="updater.state.downloading">
            <span class="update-banner__text">
                Download di <strong>Bookeeper {{ updater.state.info?.latest }}</strong>…
            </span>
            <ProgressBar :value="progressPct" class="update-banner__progress" />
            <span class="update-banner__pct">{{ progressPct }}%</span>
        </template>

        <!-- Stato 3: pronto da installare -->
        <template v-else-if="updater.state.ready">
            <span class="update-banner__text">
                <strong>Bookeeper {{ updater.state.info?.latest }}</strong> è pronto.
                L'app si chiuderà per completare l'installazione.
            </span>
            <div class="update-banner__actions">
                <Button size="small" severity="success"
                        icon="pi pi-refresh" label="Installa e riavvia"
                        @click="updater.installNow()" />
            </div>
        </template>
    </div>

    <UpdateChangelogDialog v-model:visible="showChangelog"
        :info="updater.state.info"
        @download="updater.startDownload(); showChangelog = false" />
</template>

<style scoped>
.update-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    background: color-mix(in oklab, var(--p-amber-500, #f59e0b) 14%, var(--p-surface-0));
    color: var(--p-amber-900, #78350f);
    border-bottom: 1px solid color-mix(in oklab, var(--p-amber-500, #f59e0b) 35%, transparent);
    font-size: 0.875rem;
    flex-shrink: 0;
}
.update-banner > i {
    font-size: 1.1rem;
    flex-shrink: 0;
}
.update-banner__text {
    flex: 1;
    min-width: 0;
}
.update-banner__sub {
    color: color-mix(in oklab, currentColor 70%, transparent);
    font-weight: 400;
    margin-left: 0.25rem;
}
.update-banner__actions {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    flex-shrink: 0;
}
.update-banner__progress {
    flex: 1;
    max-width: 320px;
    height: 8px !important;
}
.update-banner__pct {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    min-width: 3.5ch;
    text-align: right;
}

/* Stato "downloading": tono neutro/info per non sembrare urgente */
.update-banner--downloading {
    background: color-mix(in oklab, var(--p-primary-500) 8%, var(--p-surface-0));
    color: var(--p-primary-800);
    border-bottom-color: color-mix(in oklab, var(--p-primary-500) 25%, transparent);
}

/* Stato "ready": sage = call-to-action positiva */
.update-banner--ready {
    background: color-mix(in oklab, var(--p-primary-500) 16%, var(--p-surface-0));
    color: var(--p-primary-900);
    border-bottom-color: color-mix(in oklab, var(--p-primary-500) 40%, transparent);
}
</style>
