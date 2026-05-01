<script setup lang="ts">
/**
 * Phase E — Book detail view.
 *
 * Pure read-only on mobile (per MVP scope: edit happens on the desktop).
 * Layout:
 *   - Sticky-ish header with back button + truncated title.
 *   - Hero block: large cover (Open Library M / L) + meta strip
 *     (publisher · year · pages).
 *   - Authors row.
 *   - Description, ISBN list, genre, language, format, notes — each as a
 *     simple labelled section. Anything missing is hidden (no empty rows).
 *
 * Data: GET /api/v1/m/books/:id (BookHandlers.Get returns the full record).
 * SW caches this NetworkFirst with 30d TTL so an opened book is readable
 * offline shortly afterwards.
 */
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import { api, ApiError } from '@/lib/api';

interface Book {
    id: string;
    title: string;
    subtitle?: string | null;
    authors?: string[] | null;
    isbn_13?: string | null;
    isbn_10?: string | null;
    publisher?: string | null;
    published_year?: number | null;
    language?: string | null;
    page_count?: number | null;
    description?: string | null;
    format?: string | null;
    genre?: string | null;
    notes?: string | null;
    created_at?: number;
    updated_at?: number;
}

const route = useRoute();
const router = useRouter();

const book = ref<Book | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
        book.value = await api.get<Book>(`/books/${encodeURIComponent(String(route.params.id))}`);
    } catch (err) {
        error.value = err instanceof ApiError ? err.body : 'errore di rete';
        book.value = null;
    } finally {
        loading.value = false;
    }
}

onMounted(() => void load());

const coverLarge = computed<string | null>(() => {
    const isbn = book.value?.isbn_13 || book.value?.isbn_10;
    return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null;
});

const coverFailed = ref(false);

function goBack(): void {
    // If we have history, go back; otherwise fall back to the catalog tab so
    // we never strand the user on a "back is no-op" screen (HIG: predictable
    // back).
    if (window.history.length > 1) router.back();
    else router.replace({ name: 'search' });
}

function authorsLine(b: Book): string {
    if (!b.authors || b.authors.length === 0) return '—';
    return b.authors.join(', ');
}
</script>

<template>
    <section class="detail" aria-labelledby="detail-title">
        <header class="detail__bar">
            <Button
                icon="pi pi-arrow-left"
                text
                rounded
                aria-label="Indietro"
                class="detail__back"
                @click="goBack"
            />
            <h1 id="detail-title" class="detail__bar-title">
                {{ book?.title ?? 'Scheda libro' }}
            </h1>
        </header>

        <div v-if="loading" class="detail__loading" role="status" aria-live="polite">
            <ProgressSpinner style="width: 38px; height: 38px" stroke-width="3" />
        </div>

        <Message
            v-else-if="error"
            severity="error"
            :closable="false"
            class="detail__error"
            role="alert"
        >
            {{ error }}
        </Message>

        <article v-else-if="book" class="detail__body">
            <div class="hero">
                <div class="hero__cover" aria-hidden="true">
                    <img
                        v-if="coverLarge && !coverFailed"
                        :src="coverLarge"
                        alt=""
                        width="180"
                        height="260"
                        loading="eager"
                        referrerpolicy="no-referrer"
                        @error="coverFailed = true"
                    />
                    <i v-else class="pi pi-book hero__cover-fallback" />
                </div>
                <div class="hero__meta">
                    <h2 class="hero__title">{{ book.title }}</h2>
                    <p v-if="book.subtitle" class="hero__subtitle">
                        {{ book.subtitle }}
                    </p>
                    <p class="hero__authors">{{ authorsLine(book) }}</p>
                    <p
                        v-if="book.publisher || book.published_year || book.page_count"
                        class="hero__strip"
                    >
                        <span v-if="book.publisher">{{ book.publisher }}</span>
                        <span v-if="book.publisher && book.published_year"> · </span>
                        <span v-if="book.published_year">{{ book.published_year }}</span>
                        <span v-if="(book.publisher || book.published_year) && book.page_count">
                            ·
                        </span>
                        <span v-if="book.page_count">{{ book.page_count }} pp.</span>
                    </p>
                </div>
            </div>

            <section v-if="book.description" class="block">
                <h3 class="block__label">Descrizione</h3>
                <p class="block__body">{{ book.description }}</p>
            </section>

            <section
                v-if="book.isbn_13 || book.isbn_10 || book.language || book.format || book.genre"
                class="block block--grid"
            >
                <div v-if="book.isbn_13" class="kv">
                    <dt>ISBN-13</dt>
                    <dd><code>{{ book.isbn_13 }}</code></dd>
                </div>
                <div v-if="book.isbn_10" class="kv">
                    <dt>ISBN-10</dt>
                    <dd><code>{{ book.isbn_10 }}</code></dd>
                </div>
                <div v-if="book.language" class="kv">
                    <dt>Lingua</dt>
                    <dd>{{ book.language }}</dd>
                </div>
                <div v-if="book.format" class="kv">
                    <dt>Formato</dt>
                    <dd>{{ book.format }}</dd>
                </div>
                <div v-if="book.genre" class="kv">
                    <dt>Genere</dt>
                    <dd>{{ book.genre }}</dd>
                </div>
            </section>

            <section v-if="book.notes" class="block">
                <h3 class="block__label">Note</h3>
                <p class="block__body">{{ book.notes }}</p>
            </section>

            <p class="detail__hint">
                Per modificare i metadati apri Bookeeper sul desktop.
            </p>
        </article>
    </section>
</template>

<style scoped>
@import './_tab.css';

.detail {
    display: flex;
    flex-direction: column;
    /* The page already lives inside the shell which reserves bottom padding
       for the tab bar; we just add a sane top safe-area for the bar. */
    padding-top: env(safe-area-inset-top);
}

.detail__bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.5rem 0.25rem;
    background: var(--p-surface-0);
    border-bottom: 1px solid var(--p-surface-200);
    position: sticky;
    top: 0;
    z-index: 5;
}

.detail__back {
    flex-shrink: 0;
}

.detail__bar-title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--p-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.detail__loading {
    display: grid;
    place-items: center;
    padding: 3rem 0;
}

.detail__error {
    margin: 1rem;
}

.detail__body {
    padding: 1rem 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.hero {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 1rem;
    align-items: start;
}

.hero__cover {
    width: 120px;
    height: 174px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--p-surface-100);
    display: grid;
    place-items: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.hero__cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.hero__cover-fallback {
    color: var(--p-text-muted-color);
    font-size: 2rem;
}

.hero__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--p-primary-800);
    line-height: 1.2;
}

.hero__subtitle {
    margin: 0.25rem 0 0;
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
    line-height: 1.35;
}

.hero__authors {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    color: var(--p-text-color);
}

.hero__strip {
    margin: 0.375rem 0 0;
    font-size: 0.82rem;
    color: var(--p-text-muted-color);
}

.block__label {
    margin: 0 0 0.375rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.block__body {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--p-text-color);
    /* Long descriptions remain readable on narrow phones (HIG measure rule). */
    max-width: 60ch;
    white-space: pre-wrap;
}

.block--grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.625rem 1rem;
}

.kv {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.kv dt {
    font-size: 0.72rem;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0;
}

.kv dd {
    margin: 0;
    font-size: 0.9rem;
    color: var(--p-text-color);
    word-break: break-all;
}

.kv code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.82rem;
    background: var(--p-surface-100);
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
}

.detail__hint {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: var(--p-surface-100);
    border-radius: 8px;
    color: var(--p-text-muted-color);
    font-size: 0.8rem;
    line-height: 1.45;
    text-align: center;
}
</style>
