<script setup lang="ts">
/**
 * ShelfCard — wrapper card per la dashboard. Contiene header (nome,
 * count, menu azioni), barra di riempimento e SVG dello scaffale.
 */
import { computed, ref } from 'vue';
import Menu from 'primevue/menu';
import Button from 'primevue/button';
import type { Shelf, ShelfBook } from '../types';
import ShelfSvg from './ShelfSvg.vue';
import ShelfFillBar from './ShelfFillBar.vue';
import { useShelfFill } from '../composables/useShelfFill';

interface Props {
  shelf: Shelf;
  books: ShelfBook[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'open-shelf', id: string): void;
  (e: 'open-book', id: string): void;
  (e: 'pick-slot', payload: { shelfId: string; rowIndex: number; slotIndex: number }): void;
  (e: 'edit', shelf: Shelf): void;
  (e: 'delete', shelf: Shelf): void;
}>();

const shelfRef = computed(() => props.shelf);
const booksRef = computed(() => props.books);
const { fill } = useShelfFill(shelfRef, booksRef);

const menu = ref<InstanceType<typeof Menu> | null>(null);
const menuItems = computed(() => [
  {
    label: 'Apri',
    icon: 'pi pi-arrow-right',
    command: () => emit('open-shelf', props.shelf.id),
  },
  {
    label: 'Modifica',
    icon: 'pi pi-pencil',
    command: () => emit('edit', props.shelf),
  },
  {
    separator: true,
  },
  {
    label: 'Elimina',
    icon: 'pi pi-trash',
    class: 'shelf-card__menu-danger',
    command: () => emit('delete', props.shelf),
  },
]);

function toggleMenu(ev: Event): void {
  menu.value?.toggle(ev);
}
function onPickSlot(payload: { rowIndex: number; slotIndex: number }): void {
  emit('pick-slot', { shelfId: props.shelf.id, ...payload });
}
</script>

<template>
  <article class="shelf-card">
    <header class="shelf-card__header">
      <button
        class="shelf-card__title-btn"
        type="button"
        @click="emit('open-shelf', shelf.id)"
      >
        <h2 class="shelf-card__title">
          <i v-if="shelf.icon" :class="`pi ${shelf.icon} shelf-card__icon`" aria-hidden="true" />
          {{ shelf.name }}
        </h2>
      </button>
      <Button
        icon="pi pi-ellipsis-v"
        text
        rounded
        severity="secondary"
        size="small"
        aria-label="Azioni scaffale"
        @click.stop="toggleMenu"
      />
      <Menu ref="menu" :model="menuItems" :popup="true" />
    </header>

    <ShelfFillBar :fill="fill" />

    <div class="shelf-card__svg-wrap">
      <ShelfSvg
        :shelf="shelf"
        :books="books"
        @open-shelf="emit('open-shelf', $event)"
        @open-book="emit('open-book', $event)"
        @pick-slot="onPickSlot"
      />
    </div>
  </article>
</template>

<style scoped>
.shelf-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.125rem 1.25rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 14px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.shelf-card:hover {
  border-color: var(--p-primary-300);
  box-shadow: 0 4px 16px #0000000a;
}
.shelf-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.shelf-card__title-btn {
  flex: 1;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  min-width: 0;
}
.shelf-card__title-btn:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 2px;
  border-radius: 4px;
}
.shelf-card__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shelf-card__icon {
  color: var(--p-primary-500);
  font-size: 1rem;
}
.shelf-card__svg-wrap {
  /* Cap su SVG molto grandi: max-height evita "muro" su scaffali con
     molte mensole e poche colonne. */
  max-height: 320px;
  overflow: hidden;
}
</style>

<style>
html.dark .shelf-card {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .shelf-card:hover {
  border-color: var(--p-primary-500);
}
.shelf-card__menu-danger .p-menuitem-text,
.shelf-card__menu-danger .p-menuitem-icon {
  color: var(--p-red-500, #dc2626);
}
</style>
