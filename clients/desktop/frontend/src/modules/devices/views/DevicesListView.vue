<script setup lang="ts">
/**
 * Lista dispositivi. GET /api/v1/devices → tabella con nome, tipo, ultimo
 * accesso, stato (attivo/revocato) e azione di revoca.
 *
 * Auto-refresh ogni 10s mentre la pagina è visibile, in modo che il
 * pairing di un nuovo mobile appaia senza dover fare F5. Usiamo
 * `document.visibilityState` per evitare polling in background.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

import { devicesEndpoints, type DeviceSummary } from '@/lib/api/endpoints/devices';
import { ApiError } from '@/lib/api/client';

const router = useRouter();
const confirm = useConfirm();
const toast = useToast();

const devices = ref<DeviceSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const revokingId = ref<string | null>(null);

let pollId: number | undefined;

async function fetchDevices(silent = false): Promise<void> {
    if (!silent) loading.value = true;
    error.value = null;
    try {
        devices.value = await devicesEndpoints.list();
    } catch (err: unknown) {
        error.value = err instanceof ApiError ? err.body : 'errore di rete';
    } finally {
        loading.value = false;
    }
}

function startPolling(): void {
    stopPolling();
    pollId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            void fetchDevices(true);
        }
    }, 10_000);
}

function stopPolling(): void {
    if (pollId !== undefined) {
        window.clearInterval(pollId);
        pollId = undefined;
    }
}

function onVisibility(): void {
    if (document.visibilityState === 'visible') {
        void fetchDevices(true);
    }
}

onMounted(() => {
    void fetchDevices();
    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', onVisibility);
});

function pairMobile(): void {
    router.push({ name: 'devices-pair-mobile' });
}

function fmtDate(ts: number | undefined): string {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleString('it-IT', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function kindIcon(kind: string): string {
    switch (kind) {
        case 'mobile':
            return 'pi pi-mobile';
        case 'desktop':
            return 'pi pi-desktop';
        default:
            return 'pi pi-circle';
    }
}

function kindLabel(kind: string): string {
    switch (kind) {
        case 'mobile':
            return 'Mobile';
        case 'desktop':
            return 'Desktop';
        default:
            return kind || '—';
    }
}

function shortFp(fp: string): string {
    if (!fp) return '';
    return fp.length > 16 ? `${fp.slice(0, 8)}…${fp.slice(-6)}` : fp;
}

function confirmRevoke(d: DeviceSummary): void {
    confirm.require({
        message: `Revocare il dispositivo "${d.name}"? Non potrà più accedere finché non viene riabbinato.`,
        header: 'Conferma revoca',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Revoca',
        rejectLabel: 'Annulla',
        acceptClass: 'p-button-danger',
        accept: () => {
            void revoke(d);
        },
    });
}

async function revoke(d: DeviceSummary): Promise<void> {
    revokingId.value = d.id;
    try {
        await devicesEndpoints.revoke(d.id);
        toast.add({
            severity: 'success',
            summary: 'Dispositivo revocato',
            detail: d.name,
            life: 2500,
        });
        await fetchDevices(true);
    } catch (err: unknown) {
        toast.add({
            severity: 'error',
            summary: 'Revoca fallita',
            detail: err instanceof ApiError ? err.body : 'errore di rete',
            life: 4000,
        });
    } finally {
        revokingId.value = null;
    }
}
</script>

<template>
    <div class="page">
        <header class="page__header">
            <div>
                <h1 class="page__title">Dispositivi</h1>
                <p class="page__sub">
                    Gestisci i client che possono accedere alla tua libreria.
                </p>
            </div>
            <div class="page__actions">
                <Button
                    icon="pi pi-refresh"
                    text
                    rounded
                    aria-label="Aggiorna"
                    :disabled="loading"
                    @click="() => fetchDevices()"
                />
                <Button
                    label="Abbina mobile"
                    icon="pi pi-qrcode"
                    @click="pairMobile"
                />
            </div>
        </header>

        <Message v-if="error" severity="error" :closable="false" class="page__error">
            {{ error }}
        </Message>

        <section v-if="loading && devices.length === 0" class="page__loading">
            <ProgressSpinner style="width: 42px; height: 42px" stroke-width="3" />
        </section>

        <section
            v-else-if="!loading && devices.length === 0 && !error"
            class="page__placeholder"
        >
            <i class="pi pi-mobile" aria-hidden="true" />
            <p>Nessun dispositivo aggiuntivo abbinato.</p>
            <small>
                Genera un QR per aggiungere il companion mobile e gestire la libreria
                anche dal telefono.
            </small>
        </section>

        <DataTable
            v-else
            :value="devices"
            data-key="id"
            class="page__table"
            striped-rows
            :row-class="(d: DeviceSummary) => (d.revoked ? 'row--revoked' : '')"
        >
            <Column field="name" header="Nome">
                <template #body="{ data }: { data: DeviceSummary }">
                    <div class="cell-name">
                        <i :class="kindIcon(data.kind)" aria-hidden="true" />
                        <span>{{ data.name }}</span>
                    </div>
                </template>
            </Column>
            <Column field="kind" header="Tipo" style="width: 110px">
                <template #body="{ data }: { data: DeviceSummary }">
                    {{ kindLabel(data.kind) }}
                </template>
            </Column>
            <Column header="Stato" style="width: 130px">
                <template #body="{ data }: { data: DeviceSummary }">
                    <Tag
                        v-if="data.revoked"
                        severity="danger"
                        value="Revocato"
                    />
                    <Tag
                        v-else
                        severity="success"
                        value="Attivo"
                    />
                </template>
            </Column>
            <Column field="paired_at" header="Abbinato il" style="width: 180px">
                <template #body="{ data }: { data: DeviceSummary }">
                    {{ fmtDate(data.paired_at) }}
                </template>
            </Column>
            <Column field="last_seen" header="Ultimo accesso" style="width: 180px">
                <template #body="{ data }: { data: DeviceSummary }">
                    {{ fmtDate(data.last_seen) }}
                </template>
            </Column>
            <Column header="Fingerprint" style="width: 180px">
                <template #body="{ data }: { data: DeviceSummary }">
                    <code class="cell-fp" :title="data.cert_fingerprint">
                        {{ shortFp(data.cert_fingerprint) }}
                    </code>
                </template>
            </Column>
            <Column header="" style="width: 110px">
                <template #body="{ data }: { data: DeviceSummary }">
                    <Button
                        v-if="!data.revoked"
                        label="Revoca"
                        severity="danger"
                        text
                        size="small"
                        :loading="revokingId === data.id"
                        @click="confirmRevoke(data)"
                    />
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<style scoped>
.page {
    padding: 1.5rem 2rem 2rem;
    max-width: 80rem;
    margin: 0 auto;
}

.page__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.page__actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.page__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.page__sub {
    margin: 0.25rem 0 0;
    color: var(--p-text-muted-color);
}

.page__error {
    margin-bottom: 1rem;
}

.page__loading {
    display: grid;
    place-items: center;
    padding: 4rem 0;
}

.page__placeholder {
    text-align: center;
    padding: 4rem 1.5rem;
    background: var(--p-surface-0);
    border: 1px dashed var(--p-surface-300);
    border-radius: 12px;
    color: var(--p-text-muted-color);
}

.page__placeholder i {
    font-size: 2.5rem;
    color: var(--p-primary-400);
    display: block;
    margin-bottom: 0.75rem;
}

.page__placeholder p {
    margin: 0 0 0.25rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.page__placeholder small {
    display: block;
    max-width: 28rem;
    margin: 0 auto;
    line-height: 1.55;
}

.page__table {
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
    border-radius: 12px;
    overflow: hidden;
}

.cell-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--p-text-color);
}

.cell-name i {
    color: var(--p-primary-500);
    font-size: 1rem;
}

.cell-fp {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
    cursor: help;
}
</style>

<style>
html.dark .page__placeholder {
    background: var(--p-surface-800);
    border-color: var(--p-surface-600);
}

html.dark .page__table {
    background: var(--p-surface-900);
    border-color: var(--p-surface-700);
}

.row--revoked {
    opacity: 0.55;
}
</style>
