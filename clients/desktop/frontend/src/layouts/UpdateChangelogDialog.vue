<script setup lang="ts">
/**
 * UpdateChangelogDialog — modal con il changelog markdown del manifest.
 *
 * Volutamente NON aggiungiamo `marked` o simili come dipendenza: il
 * formato del campo `notes_md` è limitato (h1-h3, liste, link, bold,
 * italic, inline code) e un mini-renderer custom evita ~30KB di bundle
 * per una feature usata raramente.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import type { main } from '../../wailsjs/go/models';

const { t, locale } = useI18n();

const props = defineProps<{
    visible: boolean;
    info: main.UpdateInfo | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void;
    (e: 'download'): void;
}>();

function close(v: boolean) {
    emit('update:visible', v);
}

/** HTML-escape minimale per evitare XSS dal markdown del manifest. */
function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Mini-markdown → HTML (subset: heading, ul, ol, blockquote, **b**,
 * *i*, `code`, [link](url), paragrafi separati da riga vuota).
 * Sufficiente per CHANGELOG keep-a-changelog formattati.
 */
function renderMd(src: string): string {
    if (!src) return '';
    const lines = src.split(/\r?\n/);
    const out: string[] = [];
    let inUl = false;
    let inOl = false;
    let para: string[] = [];

    const flushPara = () => {
        if (para.length === 0) return;
        out.push(`<p>${inline(para.join(' '))}</p>`);
        para = [];
    };
    const closeLists = () => {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) { flushPara(); closeLists(); continue; }

        // Headings
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
            flushPara(); closeLists();
            const lvl = h[1].length;
            out.push(`<h${lvl}>${inline(esc(h[2]))}</h${lvl}>`);
            continue;
        }

        // Unordered list
        const ul = /^[-*+]\s+(.*)$/.exec(line);
        if (ul) {
            flushPara();
            if (inOl) { out.push('</ol>'); inOl = false; }
            if (!inUl) { out.push('<ul>'); inUl = true; }
            out.push(`<li>${inline(esc(ul[1]))}</li>`);
            continue;
        }

        // Ordered list
        const ol = /^\d+\.\s+(.*)$/.exec(line);
        if (ol) {
            flushPara();
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (!inOl) { out.push('<ol>'); inOl = true; }
            out.push(`<li>${inline(esc(ol[1]))}</li>`);
            continue;
        }

        // Plain text → accumulate paragraph
        closeLists();
        para.push(esc(line));
    }
    flushPara(); closeLists();
    return out.join('\n');
}

function inline(s: string): string {
    return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
            // Permetti solo http(s) per evitare javascript: links
            const safe = /^https?:\/\//i.test(url) ? url : '#';
            return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        });
}

const renderedNotes = computed(() => renderMd(props.info?.notes_md ?? ''));

const formattedDate = computed(() => {
    const d = props.info?.release_date;
    if (!d) return '';
    try {
        return new Date(d).toLocaleDateString(locale.value === 'en' ? 'en-US' : 'it-IT', {
            day: 'numeric', month: 'long', year: 'numeric',
        });
    } catch { return d; }
});
</script>

<template>
    <Dialog :visible="props.visible" @update:visible="close"
            modal :dismissable-mask="true"
            :style="{ width: 'min(640px, 92vw)' }">
        <template #header>
            <div class="changelog__header">
                <div class="changelog__header-icon" aria-hidden="true">
                    <i class="pi pi-sparkles"></i>
                </div>
                <div class="changelog__header-text">
                    <span class="changelog__eyebrow">{{ t('settings.changelog.eyebrow') }}</span>
                    <h2 class="changelog__title">Bookeeper {{ props.info?.latest ?? '' }}</h2>
                </div>
            </div>
        </template>

        <div class="changelog">
            <p v-if="formattedDate" class="changelog__meta">
                <i class="pi pi-calendar" aria-hidden="true"></i>
                {{ t('settings.changelog.publishedOn', { date: formattedDate }) }}
            </p>
            <div class="changelog__body" v-html="renderedNotes"></div>
        </div>

        <template #footer>
            <Button text :label="t('settings.changelog.later')" severity="secondary"
                    @click="close(false)" />
            <Button :label="t('settings.changelog.download')" icon="pi pi-download"
                    @click="emit('download')" />
        </template>
    </Dialog>
</template>

<style scoped>
/* Header brandizzato: icon-tile sage gradient + occhiello editoriale. */
.changelog__header {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    width: 100%;
}
.changelog__header-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
    color: var(--p-primary-50);
    flex-shrink: 0;
    box-shadow: 0 1px 3px color-mix(in oklab, var(--p-primary-700) 30%, transparent);
}
.changelog__header-icon i { font-size: 1.25rem; }
.changelog__header-text { display: flex; flex-direction: column; line-height: 1.15; }
.changelog__eyebrow {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--p-primary-700);
    font-weight: 600;
}
.changelog__title {
    margin: 0.15rem 0 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.changelog__meta {
    margin: 0 0 1rem;
    color: var(--p-text-muted-color);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
}
.changelog__body {
    line-height: 1.6;
    color: var(--p-text-color);
    max-height: 50vh;
    overflow-y: auto;
    padding-right: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--p-primary-500) 40%, transparent) transparent;
}
.changelog__body :deep(h1),
.changelog__body :deep(h2),
.changelog__body :deep(h3) {
    margin: 1.25rem 0 0.5rem;
    color: var(--p-primary-700);
    font-weight: 600;
}
.changelog__body :deep(h2) {
    padding-bottom: 0.25rem;
    border-bottom: 1px solid color-mix(in oklab, var(--p-primary-500) 20%, transparent);
}
.changelog__body :deep(h1) { font-size: 1.15rem; }
.changelog__body :deep(h2) { font-size: 1.05rem; }
.changelog__body :deep(h3) { font-size: 0.95rem; }
.changelog__body :deep(h1):first-child,
.changelog__body :deep(h2):first-child,
.changelog__body :deep(h3):first-child {
    margin-top: 0;
}
.changelog__body :deep(ul),
.changelog__body :deep(ol) {
    margin: 0.5rem 0 0.75rem 1.25rem;
    padding: 0;
}
.changelog__body :deep(li) {
    margin: 0.25rem 0;
}
.changelog__body :deep(li::marker) {
    color: var(--p-primary-500);
}
.changelog__body :deep(code) {
    background: var(--p-surface-100);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.changelog__body :deep(a) {
    color: var(--p-primary-600);
    text-decoration: underline;
    text-underline-offset: 2px;
}
.changelog__body :deep(a:hover) {
    color: var(--p-primary-700);
}
.changelog__body :deep(p) {
    margin: 0.5rem 0;
}

:global(.dark) .changelog__eyebrow { color: var(--p-primary-300); }
:global(.dark) .changelog__body :deep(h1),
:global(.dark) .changelog__body :deep(h2),
:global(.dark) .changelog__body :deep(h3) { color: var(--p-primary-200); }
:global(.dark) .changelog__body :deep(code) { background: var(--p-surface-700); }
</style>
