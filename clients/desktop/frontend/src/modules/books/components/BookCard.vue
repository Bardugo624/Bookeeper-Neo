<script setup lang="ts">
/**
 * BookCard — card editoriale per la vista a griglia.
 * Layout: copertina a sinistra, metadati a destra (titolo, autori, anno).
 * Tutta la card è cliccabile (router-link che avvolge il contenuto).
 */
import { RouterLink } from 'vue-router';
import BookCover from './BookCover.vue';
import type { Book } from '../types';

defineProps<{ book: Book }>();
</script>

<template>
  <RouterLink
    :to="{ name: 'book-detail', params: { id: book.id } }"
    class="book-card"
    :aria-label="`Apri ${book.title}`"
  >
    <BookCover
      :title="book.title"
      :path="book.cover_path"
      :isbn="book.isbn_13 || book.isbn_10"
      size="md"
    />
    <div class="book-card__meta">
      <h3 class="book-card__title">{{ book.title }}</h3>
      <p v-if="book.subtitle" class="book-card__sub">{{ book.subtitle }}</p>
      <p v-if="book.authors?.length" class="book-card__authors">
        {{ book.authors.join(', ') }}
      </p>
      <p class="book-card__detail">
        <span v-if="book.published_year">{{ book.published_year }}</span>
        <span v-if="book.format" class="book-card__chip">{{ book.format }}</span>
        <span v-if="book.genre" class="book-card__chip book-card__chip--genre">{{ book.genre }}</span>
      </p>
    </div>
  </RouterLink>
</template>

<style scoped>
.book-card {
  display: flex;
  gap: 1rem;
  padding: 0.875rem;
  border-radius: 12px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  text-decoration: none;
  color: inherit;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
  min-height: 168px;
}
.book-card:hover {
  transform: translateY(-1px);
  border-color: var(--p-primary-300);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}
.book-card:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 2px;
}
.book-card__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.book-card__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 0.125rem;
  line-height: 1.25;
  letter-spacing: -0.01em;
  /* clamp 2 righe */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.book-card__sub {
  font-size: 0.85rem;
  color: var(--p-surface-600);
  margin: 0 0 0.375rem;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.book-card__authors {
  font-size: 0.875rem;
  color: var(--p-surface-700);
  margin: 0 0 auto;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.book-card__detail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem 0.5rem;
  font-size: 0.8rem;
  color: var(--p-surface-500);
  margin: 0.5rem 0 0;
  /* Permetti shrink dei figli su righe strette */
  min-width: 0;
}
.book-card__chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--p-surface-100);
  color: var(--p-surface-700);
  font-size: 0.75rem;
  text-transform: capitalize;
  /* Tronca testi lunghi (es. genere multi-livello BISAC) per evitare
     overflow oltre il bordo della card. */
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-card__chip--genre {
  background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);
  color: var(--p-primary-700);
  text-transform: none;
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .book-card {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .book-card:hover {
  border-color: var(--p-primary-500);
}
html.dark .book-card__sub,
html.dark .book-card__detail {
  color: var(--p-surface-400);
}
html.dark .book-card__authors {
  color: var(--p-surface-200);
}
html.dark .book-card__chip {
  background: var(--p-surface-700);
  color: var(--p-surface-200);
}
html.dark .book-card__chip--genre {
  background: color-mix(in srgb, var(--p-primary-500) 28%, transparent);
  color: var(--p-primary-200);
}
</style>
