<script setup lang="ts">
/**
 * Phase D — Catalog search (FTS).
 *
 * UX choices:
 *   - Single full-width InputText with leading icon. iOS keyboard "Search"
 *     hint via `enterkeyhint="search"`.
 *   - 300ms debounce on input → matches the desktop pattern, avoids hammering
 *     the SQLite FTS5 index on every keystroke.
 *   - Empty query lists the latest 50 books (recently added).
 *   - Card layout: title bold + authors muted, cover thumbnail when an ISBN
 *     is present (Open Library covers, no auth required, edge-cached).
 *   - Touch targets ≥44px (Apple HIG), no hover affordances.
 *   - Errors render inline so the user can pull-to-refresh / retry.
 *
 * Detail view is deferred (Phase E); tap is a no-op for now beyond
 * highlighting the row.
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import { useRouter } from 'vue-router';
import { api, ApiError } from '@/lib/api';

// Named so `<keep-alive include="SearchView">` in TabsShell preserves the
// query string and scroll position when switching tabs.
defineOptions({ name: 'SearchView' });

const router = useRouter();

interface Book {
    id: string;
    title: string;
    subtitle?: string | null;
    authors?: string[] | null;
    isbn_13?: string | null;
    isbn_10?: string | null;
    publisher?: string | null;
    published_year?: number | null;
}

const query = ref('');
const books = ref<Book[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

let debounceId: number | undefined;
let inflight = 0;

async function fetchBooks(q: string, opts?: { forceRefresh?: boolean }): Promise<void> {
    const seq = ++inflight;
    loading.value = true;
    error.value = null;
    try {
        const params = new URLSearchParams({ limit: '50' });
        if (q) params.set('q', q);
        const data = await api.get<{ books: Book[] }>(
            `/books?${params.toString()}`,
            { forceRefresh: opts?.forceRefresh },
        );
        if (seq !== inflight) return; // stale response
        books.value = data.books ?? [];
    } catch (err) {
        if (seq !== inflight) return;
        error.value = err instanceof ApiError ? err.body : 'errore di rete';
        books.value = [];
    } finally {
        if (seq === inflight) loading.value = false;
    }
}

watch(query, (q) => {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => fetchBooks(q.trim()), 300);
});

onMounted(() => fetchBooks(''));

/**
 * Sincronizzazione lazy: quando l'utente torna sulla scheda, rifacciamo
 * il fetch per riflettere modifiche (cancellazioni, aggiunte) fatte da
 * un altro client (desktop). Saltiamo se la query e' attiva: in quel
 * caso il debounce sulla ricerca prendera' carico al prossimo input.
 */
function onVisibility(): void {
    if (document.visibilityState === 'visible' && !loading.value) {
        void fetchBooks(query.value.trim(), { forceRefresh: true });
    }
}

onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
});

onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
});

function coverUrl(b: Book): string | null {
    const isbn = b.isbn_13 || b.isbn_10;
    if (!isbn) return null;
    // Open Library covers are public, CDN-cached, no API key. `M` size
    // (~180px) keeps mobile bandwidth reasonable.
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
}

// Track which book ids had a cover load failure → show fallback icon
// instead of a blank tile (avoids broken-image vibe).
const coverFailed = ref<Set<string>>(new Set());
function onCoverError(id: string): void {
    coverFailed.value = new Set(coverFailed.value).add(id);
}
function showCover(b: Book): boolean {
    return !!coverUrl(b) && !coverFailed.value.has(b.id);
}

function authorsLine(b: Book): string {
    if (!b.authors || b.authors.length === 0) return '—';
    if (b.authors.length === 1) return b.authors[0];
    if (b.authors.length === 2) return b.authors.join(' & ');
    return `${b.authors[0]} +${b.authors.length - 1}`;
}
</script>

<template>
    <section class="tab" aria-labelledby="tab-search-title">
        <header class="tab__header">
            <h1 id="tab-search-title" class="tab__title">Cerca</h1>
            <div class="search">
                <i class="pi pi-search search__icon" aria-hidden="true" />
                <InputText
                    v-model="query"
                    class="search__input"
                    placeholder="Titolo, autore, ISBN…"
                    autocomplete="off"
                    enterkeyhint="search"
                    inputmode="search"
                    aria-label="Cerca libri"
                />
                <button
                    v-if="query"
                    class="search__clear"
                    type="button"
                    aria-label="Pulisci ricerca"
                    @click="query = ''"
                >
                    <i class="pi pi-times" aria-hidden="true" />
                </button>
            </div>
        </header>

        <div class="results">
            <div v-if="loading && books.length === 0" class="results__loading" role="status">
                <ProgressSpinner style="width: 38px; height: 38px" stroke-width="3" />
            </div>

            <Message
                v-if="error"
                severity="error"
                :closable="false"
                class="results__error"
                role="alert"
            >
                {{ error }}
            </Message>

            <p class="sr-only" role="status" aria-live="polite">
                <template v-if="!loading && !error">
                    {{ books.length }} risultati
                </template>
            </p>

            <div v-if="!loading && !error && books.length === 0" class="results__empty">
                <i class="pi pi-inbox results__empty-icon" aria-hidden="true" />
                <p v-if="query">Nessun libro trovato per «{{ query }}».</p>
                <p v-else>Nessun libro nel catalogo.</p>
            </div>

            <ul v-if="books.length" class="list" aria-label="Risultati">
                <li v-for="b in books" :key="b.id" class="list__item">
                    <button
                        class="card"
                        type="button"
                        :aria-label="`Apri scheda di ${b.title}`"
                        @click="router.push({ name: 'book-detail', params: { id: b.id } })"
                    >
                        <div class="card__cover" aria-hidden="true">
                            <img
                                v-if="showCover(b)"
                                :src="coverUrl(b) ?? ''"
                                alt=""
                                width="56"
                                height="80"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                @error="onCoverError(b.id)"
                            />
                            <i v-else class="pi pi-book card__cover-fallback" />
                        </div>
                        <div class="card__body">
                            <p class="card__title">{{ b.title }}</p>
                            <p v-if="b.subtitle" class="card__subtitle">{{ b.subtitle }}</p>
                            <p class="card__authors">{{ authorsLine(b) }}</p>
                            <p v-if="b.published_year || b.publisher" class="card__meta">
                                <span v-if="b.publisher">{{ b.publisher }}</span>
                                <span v-if="b.publisher && b.published_year"> · </span>
                                <span v-if="b.published_year">{{ b.published_year }}</span>
                            </p>
                        </div>
                    </button>
                </li>
            </ul>
        </div>
    </section>
</template>

<style scoped>
@import './_tab.css';

.tab__header {
    padding-bottom: 0.75rem;
}

.search {
    position: relative;
    margin: 0.75rem 1rem 0;
    display: flex;
    align-items: center;
}

.search__icon {
    position: absolute;
    left: 0.875rem;
    color: var(--p-text-muted-color);
    font-size: 0.95rem;
    pointer-events: none;
}

.search__input {
    width: 100%;
    min-height: 44px;
    padding-left: 2.5rem;
    padding-right: 2.5rem;
    border-radius: 10px;
    font-size: 0.95rem;
}

.search__clear {
    position: absolute;
    right: 0.5rem;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--p-surface-100);
    color: var(--p-text-muted-color);
    display: grid;
    place-items: center;
    cursor: pointer;
}

.results {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 1rem 1.5rem;
    -webkit-overflow-scrolling: touch;
}

.results__loading {
    display: grid;
    place-items: center;
    padding: 2rem 0;
}

.results__error {
    margin-bottom: 0.75rem;
}

.results__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: var(--p-text-muted-color);
    text-align: center;
}

.results__empty-icon {
    font-size: 2rem;
    opacity: 0.55;
}

.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.card {
    display: flex;
    gap: 0.875rem;
    width: 100%;
    padding: 0.75rem;
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
    border-radius: 12px;
    text-align: left;
    cursor: pointer;
    min-height: 88px;
    transition: background 120ms ease;
    /* Senza un color esplicito sul <button>, alcuni browser mobile (in
       particolare WebView Android) ereditano da `ButtonText` di sistema
       e i <p> figli risultano invisibili sul tema chiaro/scuro. */
    color: var(--p-text-color);
    font: inherit;
}

.card:active {
    background: var(--p-surface-100);
}

.card:focus-visible {
    outline: 2px solid var(--p-primary-500);
    outline-offset: 2px;
}

/* Visually-hidden helper for live regions / sr-only labels. */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.card__cover {
    flex: 0 0 56px;
    width: 56px;
    height: 80px;
    background: var(--p-surface-100);
    border-radius: 6px;
    overflow: hidden;
    display: grid;
    place-items: center;
}

.card__cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.card__cover-fallback {
    color: var(--p-text-muted-color);
    font-size: 1.25rem;
}

.card__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
}

.card__title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: inherit;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
}

.card__subtitle {
    margin: 0;
    font-size: 0.82rem;
    color: var(--p-text-muted-color);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.card__authors {
    margin: 0.125rem 0 0;
    font-size: 0.85rem;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.card__meta {
    margin: 0;
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
}
</style>
