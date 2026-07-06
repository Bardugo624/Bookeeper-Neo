<script setup lang="ts">
/**
 * BookCard — card editoriale per la vista a griglia.
 * Layout: copertina a sinistra, metadati a destra (titolo, autori, anno).
 * Tutta la card è cliccabile (router-link che avvolge il contenuto).
 */
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BookCover from './BookCover.vue';
import type { Book } from '../types';

defineProps<{ book: Book }>();
const { t } = useI18n();
</script>

<template>
  <RouterLink
    :to="{ name: 'book-detail', params: { id: book.id } }"
    class="book-card"
    :aria-label="t('books.card.openAria', { title: book.title })"
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
  border-radius: var(--bk-radius);
  background: var(--bk-surface);
  border: 1px solid var(--bk-border);
  text-decoration: none;
  color: inherit;
  transition:
    box-shadow var(--bk-dur) var(--bk-ease),
    border-color var(--bk-dur) var(--bk-ease);
  min-height: 168px;
}
.book-card:hover {
  border-color: var(--p-primary-300);
  box-shadow: var(--bk-shadow-2);
}
/* La star dell'hover è la copertina: si solleva come un libro sfilato
 * dallo scaffale. La card resta ferma (niente doppio movimento). */
.book-card :deep(.cover) {
  transform-origin: bottom center;
}
.book-card:hover :deep(.cover) {
  transform: translateY(-3px) rotate(-0.5deg);
  box-shadow: var(--bk-shadow-book-lift);
}
@media (prefers-reduced-motion: reduce) {
  .book-card:hover :deep(.cover) {
    transform: none;
  }
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
  color: var(--bk-text-muted);
  margin: 0 0 0.375rem;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.book-card__authors {
  font-size: 0.875rem;
  color: var(--bk-text);
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
  color: var(--bk-text-faint);
  margin: 0.5rem 0 0;
  /* Permetti shrink dei figli su righe strette */
  min-width: 0;
}
.book-card__chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--bk-inset);
  color: var(--bk-text-muted);
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

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`.
     Superfici/bordi ora arrivano dai token (--bk-*): qui restano solo
     le eccezioni che i token non coprono. -->
<style>
html.dark .book-card:hover {
  border-color: var(--p-primary-500);
}
html.dark .book-card__chip--genre {
  background: color-mix(in srgb, var(--p-primary-500) 28%, transparent);
  color: var(--p-primary-200);
}
</style>
