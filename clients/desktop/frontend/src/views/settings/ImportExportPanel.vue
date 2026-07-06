<script setup lang="ts">
/**
 * ImportExportPanel — tab "Dati" delle Impostazioni (roadmap 1.1).
 *
 * Wizard import in 3 passi impliciti: scegli file → anteprima dry-run
 * (nuovi/duplicati/errori) → conferma. Export JSON/CSV con dialog nativo.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import { importExportApi, type ImportFormat, type ImportResult } from '@/lib/api/endpoints/importexport';

const { t } = useI18n();
const toast = useToast();

// --- Import ---
const fileName = ref('');
const fileContent = ref('');
const format = ref<ImportFormat>('auto');
const preview = ref<ImportResult | null>(null);
const analyzing = ref(false);
const importing = ref(false);
const done = ref<ImportResult | null>(null);

const formatOptions = [
    { label: 'Auto', value: 'auto' },
    { label: 'Goodreads (CSV)', value: 'goodreads' },
    { label: 'Calibre (CSV)', value: 'calibre' },
    { label: 'LibraryThing (TSV)', value: 'librarything' },
];

async function pickFile() {
    try {
        const f = await importExportApi.pickFile();
        if (!f || !f.name) return; // annullato
        fileName.value = f.name;
        fileContent.value = f.content;
        done.value = null;
        await analyze();
    } catch (e) {
        toastErr(e);
    }
}

async function analyze() {
    analyzing.value = true;
    preview.value = null;
    try {
        preview.value = await importExportApi.import(fileContent.value, format.value, true);
    } catch (e) {
        toastErr(e);
        reset();
    } finally {
        analyzing.value = false;
    }
}

async function confirmImport() {
    importing.value = true;
    try {
        done.value = await importExportApi.import(fileContent.value, format.value, false);
        toast.add({
            severity: 'success',
            summary: t('settings.data.importDoneTitle'),
            detail: t('settings.data.importDoneDetail', { n: done.value.imported }),
            life: 5000,
        });
        reset();
    } catch (e) {
        toastErr(e);
    } finally {
        importing.value = false;
    }
}

function reset() {
    fileName.value = '';
    fileContent.value = '';
    preview.value = null;
}

// --- Export ---
const exporting = ref<'json' | 'csv' | null>(null);

async function doExport(fmt: 'json' | 'csv') {
    exporting.value = fmt;
    try {
        const raw = await importExportApi.exportRaw(fmt);
        const path = await importExportApi.saveFile(`bookeeper-export.${fmt}`, raw);
        if (path) {
            toast.add({
                severity: 'success',
                summary: t('settings.data.exportDoneTitle'),
                detail: path,
                life: 5000,
            });
        }
    } catch (e) {
        toastErr(e);
    } finally {
        exporting.value = null;
    }
}

function toastErr(e: unknown) {
    toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: e instanceof Error ? e.message : String(e),
        life: 6000,
    });
}
</script>

<template>
    <!-- ===================== IMPORT ===================== -->
    <section class="settings__card" aria-labelledby="data-imp-h">
        <h2 id="data-imp-h" class="settings__card-title">{{ t('settings.data.importTitle') }}</h2>
        <p class="settings__hint">{{ t('settings.data.importHint') }}</p>

        <div class="impexp__row">
            <Select
                v-model="format"
                :options="formatOptions"
                option-label="label"
                option-value="value"
                :aria-label="t('settings.data.formatLabel')"
                class="impexp__format"
                @change="fileContent && analyze()"
            />
            <Button
                :label="fileName ? t('settings.data.changeFile') : t('settings.data.chooseFile')"
                icon="pi pi-file-import"
                :loading="analyzing"
                @click="pickFile"
            />
            <span v-if="fileName" class="impexp__filename">{{ fileName }}</span>
        </div>

        <div v-if="preview" class="impexp__preview">
            <div class="impexp__counts">
                <Tag severity="success" :value="t('settings.data.countNew', { n: preview.new })" />
                <Tag severity="secondary" :value="t('settings.data.countDuplicates', { n: preview.duplicates })" />
                <Tag v-if="preview.errors.length" severity="warn" :value="t('settings.data.countErrors', { n: preview.errors.length })" />
                <Tag severity="info" :value="t('settings.data.detectedFormat', { f: preview.format })" />
            </div>

            <ul v-if="preview.preview.length" class="impexp__books">
                <li v-for="(b, i) in preview.preview" :key="i">
                    <strong>{{ b.title }}</strong>
                    <span v-if="b.authors.length"> — {{ b.authors.join(', ') }}</span>
                    <code v-if="b.isbn_13 || b.isbn_10" class="impexp__isbn">{{ b.isbn_13 || b.isbn_10 }}</code>
                </li>
                <li v-if="preview.new > preview.preview.length" class="impexp__more">
                    {{ t('settings.data.moreBooks', { n: preview.new - preview.preview.length }) }}
                </li>
            </ul>
            <p v-else class="settings__hint">{{ t('settings.data.nothingNew') }}</p>

            <div class="settings__actions">
                <Button
                    :label="t('settings.data.confirmImport', { n: preview.new })"
                    icon="pi pi-check"
                    :disabled="preview.new === 0"
                    :loading="importing"
                    @click="confirmImport"
                />
                <Button
                    :label="t('common.cancel')"
                    severity="secondary" text
                    @click="reset"
                />
            </div>
        </div>
    </section>

    <!-- ===================== EXPORT ===================== -->
    <section class="settings__card" aria-labelledby="data-exp-h">
        <h2 id="data-exp-h" class="settings__card-title">{{ t('settings.data.exportTitle') }}</h2>
        <p class="settings__hint">{{ t('settings.data.exportHint') }}</p>
        <div class="settings__actions">
            <Button
                :label="t('settings.data.exportJson')"
                icon="pi pi-download"
                severity="secondary" outlined
                :loading="exporting === 'json'"
                @click="doExport('json')"
            />
            <Button
                :label="t('settings.data.exportCsv')"
                icon="pi pi-download"
                severity="secondary" outlined
                :loading="exporting === 'csv'"
                @click="doExport('csv')"
            />
        </div>
    </section>
</template>

<style scoped>
.impexp__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
}
.impexp__format {
    min-width: 12rem;
}
.impexp__filename {
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
}
.impexp__preview {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
}
.impexp__counts {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.impexp__books {
    margin: 0;
    padding: 0.75rem 1rem;
    list-style: none;
    border: 1px solid var(--p-surface-200);
    border-radius: 8px;
    max-height: 16rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
}
.impexp__isbn {
    margin-left: 0.5rem;
    font-size: 0.8em;
    color: var(--p-text-muted-color);
}
.impexp__more {
    color: var(--p-text-muted-color);
    font-style: italic;
}
:global(.dark) .impexp__books {
    border-color: var(--p-surface-700);
}
</style>
