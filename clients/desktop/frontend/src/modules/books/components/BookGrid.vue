<script setup lang="ts">
/**
 * BookGrid — griglia responsive auto-fill di BookCard.
 */
import BookCard from './BookCard.vue';
import type { Book } from '../types';

defineProps<{ books: Book[] }>();
</script>

<template>
  <div class="book-grid" role="list">
    <div v-for="b in books" :key="b.id" role="listitem">
      <BookCard :book="b" />
    </div>
  </div>
</template>

<style scoped>
.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}
</style>
