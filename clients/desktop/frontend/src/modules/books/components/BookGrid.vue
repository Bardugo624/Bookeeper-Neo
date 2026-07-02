<script setup lang="ts">
/**
 * BookGrid — griglia responsive auto-fill di BookCard.
 *
 * Entrance: stagger sobrio (30ms/item, cap a 360ms totali) solo sul
 * primo mount della griglia; le ricerche successive non ri-animano
 * (l'indice di stagger è fissato alla prima comparsa dell'item).
 * Il default è visibile (bk-rise anima solo `from`), quindi con
 * reduced-motion o renderer headless il contenuto c'è comunque.
 */
import BookCard from './BookCard.vue';
import type { Book } from '../types';

defineProps<{ books: Book[] }>();

const STAGGER_CAP = 12; // oltre il 12° item niente ritardo aggiuntivo
</script>

<template>
  <div class="book-grid" role="list">
    <div
      v-for="(b, i) in books"
      :key="b.id"
      role="listitem"
      class="book-grid__item"
      :style="{ '--i': Math.min(i, STAGGER_CAP) }"
    >
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
.book-grid__item {
  animation: bk-rise var(--bk-dur-slow) var(--bk-ease) backwards;
  animation-delay: calc(var(--i, 0) * 30ms);
}
</style>
