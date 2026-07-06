<script setup lang="ts">
/**
 * BackupPanel — card Backup + card Ripristino del tab "Dati" (roadmap 1.2).
 *
 * Backup: dump JSON della libreria, salvato via dialog nativo. In modalità
 * locale in più: backup automatico ogni N giorni (rotazione ultimi 5) con
 * toggle e lista dei file.
 *
 * Ripristino: distruttivo, gated da admin password. In locale la password
 * viene recuperata da Go (l'utente non la conosce); in remoto va digitata.
 * Doppia conferma: scelta file → dialog con riepilogo + nome libreria da
 * ricopiare.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import ToggleSwitch from 'primevue/toggleswitch';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { tenantEndpoints } from '@/lib/api/endpoints/tenant';
import { backupApi, importExportApi } from '@/lib/api/endpoints/importexport';
import { main } from '../../../wailsjs/go/models';

const { t, locale } = useI18n();
const toast = useToast();
const auth = useAuthStore();

const isLocal = computed(() => !!auth.session.local);

// --- Backup manuale ---
const savingBackup = ref(false);

async function saveBackup() {
    savingBackup.value = true;
    try {
        const raw = await backupApi.createRaw();
        const name = `bookeeper-backup-${new Date().toISOString().slice(0, 10)}.json`;
        const path = await importExportApi.saveFile(name, raw);
        if (path) {
            toast.add({ severity: 'success', summary: t('settings.backup.savedTitle'), detail: path, life: 5000 });
            void refreshLocal();
        }
    } catch (e) {
        toastErr(e);
    } finally {
        savingBackup.value = false;
    }
}

// --- Auto-backup locale ---
const cfg = ref<main.BackupConfig | null>(null);
const backups = ref<main.BackupEntry[]>([]);
const runningNow = ref(false);

async function refreshLocal() {
    if (!isLocal.value) return;
    try {
        cfg.value = await backupApi.config();
        backups.value = await backupApi.list();
    } catch { /* pannello opzionale: niente toast d'errore all'apertura */ }
}

async function toggleAuto(v: boolean) {
    if (!cfg.value) return;
    cfg.value.enabled = v;
    try {
        await backupApi.setConfig(cfg.value);
    } catch (e) {
        toastErr(e);
    }
}

async function backupNow() {
    runningNow.value = true;
    try {
        await backupApi.runNow();
        toast.add({ severity: 'success', summary: t('settings.backup.savedTitle'), life: 4000 });
        await refreshLocal();
    } catch (e) {
        toastErr(e);
    } finally {
        runningNow.value = false;
    }
}

const lastBackupLabel = computed(() => {
    const last = backups.value[0];
    if (!last) return t('settings.backup.never');
    return fmtDate(last.mod_time) + ' · ' + fmtSize(last.size);
});

function fmtDate(unix: number): string {
    return new Date(unix * 1000).toLocaleString(locale.value === 'en' ? 'en-US' : 'it-IT', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}
function fmtSize(b: number): string {
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(b / 1024)) + ' KB';
}

// --- Ripristino ---
interface BackupMeta {
    tenant_name: string
    exported_at: string
    books: number
}
const restoreFile = ref('');
const restoreRaw = ref('');
const restoreMeta = ref<BackupMeta | null>(null);
const restoreDialog = ref(false);
const adminPassword = ref('');
const confirmName = ref('');
const tenantName = ref('');
const restoring = ref(false);

onMounted(async () => {
    void refreshLocal();
    try {
        tenantName.value = (await tenantEndpoints.get()).name;
    } catch { /* il gate di conferma resta disabilitato senza nome */ }
});

async function pickBackupFile() {
    try {
        const f = await importExportApi.pickFile();
        if (!f || !f.name) return;
        let parsed: any;
        try {
            parsed = JSON.parse(f.content);
        } catch {
            toast.add({ severity: 'error', summary: t('common.error'), detail: t('settings.backup.notABackup'), life: 5000 });
            return;
        }
        if (parsed?.app !== 'bookeeper' || !parsed?.tables) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: t('settings.backup.notABackup'), life: 5000 });
            return;
        }
        restoreFile.value = f.name;
        restoreRaw.value = f.content;
        restoreMeta.value = {
            tenant_name: parsed.tenant_name ?? '?',
            exported_at: parsed.exported_at ?? '',
            books: Array.isArray(parsed.tables.books) ? parsed.tables.books.length : 0,
        };
        adminPassword.value = '';
        confirmName.value = '';
        restoreDialog.value = true;
    } catch (e) {
        toastErr(e);
    }
}

const canRestore = computed(() =>
    !!restoreRaw.value
    && confirmName.value.trim() === tenantName.value
    && tenantName.value !== ''
    && (isLocal.value || adminPassword.value.length >= 12),
);

async function doRestore() {
    restoring.value = true;
    try {
        const pwd = isLocal.value ? await backupApi.localAdminPassword() : adminPassword.value;
        const res = await backupApi.restore(restoreRaw.value, pwd);
        toast.add({
            severity: 'success',
            summary: t('settings.backup.restoredTitle'),
            detail: t('settings.backup.restoredDetail', { n: res.restored_rows }),
            life: 4000,
        });
        restoreDialog.value = false;
        // Stato client (stores, cache) ormai incoerente col DB: ricarica tutto.
        setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
        toastErr(e);
    } finally {
        restoring.value = false;
    }
}

function toastErr(e: unknown) {
    toast.add({
        severity: 'error', summary: t('common.error'),
        detail: e instanceof Error ? e.message : String(e), life: 6000,
    });
}

const exportedAtLabel = computed(() => {
    if (!restoreMeta.value?.exported_at) return '';
    try {
        return fmtDate(new Date(restoreMeta.value.exported_at).getTime() / 1000);
    } catch { return restoreMeta.value.exported_at; }
});
</script>

<template>
    <!-- ===================== BACKUP ===================== -->
    <section class="settings__card" aria-labelledby="data-bk-h">
        <h2 id="data-bk-h" class="settings__card-title">{{ t('settings.backup.title') }}</h2>
        <p class="settings__hint">{{ t('settings.backup.hint') }}</p>

        <div class="settings__actions">
            <Button
                :label="t('settings.backup.saveNow')"
                icon="pi pi-shield"
                :loading="savingBackup"
                @click="saveBackup"
            />
        </div>

        <template v-if="isLocal && cfg">
            <div class="backup__auto">
                <div class="backup__auto-row">
                    <label for="bk-auto" class="backup__auto-label">{{ t('settings.backup.autoLabel', { n: cfg.every_days }) }}</label>
                    <ToggleSwitch
                        input-id="bk-auto"
                        :model-value="cfg.enabled"
                        @update:model-value="toggleAuto"
                    />
                </div>
                <p class="settings__hint">{{ t('settings.backup.autoHint', { keep: 5 }) }}</p>
                <p class="backup__last">
                    {{ t('settings.backup.lastBackup') }}: <strong>{{ lastBackupLabel }}</strong>
                    <Button
                        text size="small"
                        :label="t('settings.backup.runNow')"
                        :loading="runningNow"
                        @click="backupNow"
                    />
                </p>
                <ul v-if="backups.length" class="backup__list">
                    <li v-for="b in backups" :key="b.name">
                        <code>{{ b.name }}</code>
                        <span class="backup__size">{{ fmtSize(b.size) }}</span>
                    </li>
                </ul>
            </div>
        </template>
    </section>

    <!-- ===================== RIPRISTINO (danger) ===================== -->
    <section class="settings__card settings__card--danger" aria-labelledby="data-rs-h">
        <h2 id="data-rs-h" class="settings__card-title">{{ t('settings.backup.restoreTitle') }}</h2>
        <div class="settings__actions">
            <Button
                :label="t('settings.backup.chooseBackup')"
                icon="pi pi-history"
                severity="danger"
                outlined
                @click="pickBackupFile"
            />
            <p class="settings__hint">{{ t('settings.backup.restoreHint') }}</p>
        </div>
    </section>

    <!-- Dialog di conferma distruttiva -->
    <Dialog
        v-model:visible="restoreDialog"
        modal
        :header="t('settings.backup.restoreDialogTitle')"
        :style="{ width: 'min(520px, 92vw)' }"
    >
        <div v-if="restoreMeta" class="restore">
            <p class="restore__summary">
                <i class="pi pi-file" aria-hidden="true" />
                <code>{{ restoreFile }}</code>
            </p>
            <dl class="restore__meta">
                <dt>{{ t('settings.backup.metaLibrary') }}</dt>
                <dd>{{ restoreMeta.tenant_name }}</dd>
                <dt>{{ t('settings.backup.metaDate') }}</dt>
                <dd>{{ exportedAtLabel }}</dd>
                <dt>{{ t('settings.backup.metaBooks') }}</dt>
                <dd>{{ restoreMeta.books }}</dd>
            </dl>

            <p class="restore__warning">{{ t('settings.backup.restoreWarning') }}</p>

            <template v-if="!isLocal">
                <label for="rs-pwd" class="restore__label">{{ t('settings.backup.adminPwdLabel') }}</label>
                <Password
                    v-model="adminPassword"
                    input-id="rs-pwd"
                    :feedback="false"
                    toggle-mask
                    class="restore__field"
                    :input-style="{ width: '100%' }"
                />
            </template>

            <label for="rs-name" class="restore__label">
                {{ t('settings.backup.typeNameLabel', { name: tenantName }) }}
            </label>
            <InputText
                id="rs-name"
                v-model="confirmName"
                class="restore__field"
                autocomplete="off"
            />
        </div>
        <template #footer>
            <Button text :label="t('common.cancel')" severity="secondary" @click="restoreDialog = false" />
            <Button
                :label="t('settings.backup.restoreConfirm')"
                icon="pi pi-history"
                severity="danger"
                :disabled="!canRestore"
                :loading="restoring"
                @click="doRestore"
            />
        </template>
    </Dialog>
</template>

<style scoped>
.backup__auto {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--p-surface-200);
}
.backup__auto-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}
.backup__auto-label {
    font-weight: 500;
}
.backup__last {
    margin: 0.75rem 0 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.9rem;
}
.backup__list {
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
}
.backup__list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
}
.backup__size {
    color: var(--p-text-muted-color);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}
.restore {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.restore__summary {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow-wrap: anywhere;
}
.restore__meta {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 1rem;
    font-size: 0.9rem;
}
.restore__meta dt {
    color: var(--p-text-muted-color);
}
.restore__meta dd {
    margin: 0;
    font-weight: 500;
}
.restore__warning {
    margin: 0;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--p-red-300, #fca5a5);
    border-radius: 8px;
    background: color-mix(in oklab, var(--p-red-500) 7%, transparent);
    font-size: 0.9rem;
}
.restore__label {
    font-size: 0.85rem;
    font-weight: 500;
}
.restore__field {
    width: 100%;
}
:global(.dark) .backup__auto {
    border-top-color: var(--p-surface-700);
}
</style>
