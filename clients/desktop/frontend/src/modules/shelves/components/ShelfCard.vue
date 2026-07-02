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

/**
 * Range del numero progressivo coperto dallo scaffale. Server-side e' una
 * subquery MIN/MAX su shelf_books JOIN books, quindi e' sempre allineato
 * dopo una fetchList. Quando entrambi i bound sono presenti e uguali
 * mostriamo "#N" (singolo libro), altrimenti "#N–M".
 */
const progressiveRange = computed<string | null>(() => {
  const lo = props.shelf.progressive_min;
  const hi = props.shelf.progressive_max;
  if (lo == null || hi == null) return null;
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
});

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
      <span
        v-if="progressiveRange"
        class="shelf-card__range"
        :title="`Numeri progressivi presenti su questo scaffale: ${progressiveRange}`"
      >
        <i class="pi pi-hashtag shelf-card__range-icon" aria-hidden="true" />
        {{ progressiveRange }}
      </span>
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
  background: var(--bk-surface);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-lg);
  transition:
    border-color var(--bk-dur-fast) var(--bk-ease),
    box-shadow var(--bk-dur) var(--bk-ease);
}
.shelf-card:hover {
  border-color: var(--p-primary-300);
  box-shadow: var(--bk-shadow-2);
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
.shelf-card__range {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-700);
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}
.shelf-card__range-icon {
  font-size: 0.65rem;
  opacity: 0.8;
}
.shelf-card__svg-wrap {
  /* Cap su SVG molto grandi: max-height evita "muro" su scaffali con
     molte mensole e poche colonne. Il mobile ha la sua ombra: poggia
     sulla card, non ci galleggia. */
  max-height: 320px;
  overflow: hidden;
  filter: drop-shadow(0 2px 4px rgb(24 22 19 / 0.18));
  transition: filter var(--bk-dur) var(--bk-ease);
}
.shelf-card:hover .shelf-card__svg-wrap {
  filter: drop-shadow(0 4px 10px rgb(24 22 19 / 0.24));
}
@media (prefers-reduced-motion: reduce) {
  .shelf-card__svg-wrap {
    transition: none;
  }
}
</style>

<style>
html.dark .shelf-card:hover {
  border-color: var(--p-primary-500);
}
html.dark .shelf-card__range {
  background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
  color: var(--p-primary-200);
}
html.dark .shelf-card__svg-wrap {
  filter: drop-shadow(0 2px 5px rgb(0 0 0 / 0.5));
}
.shelf-card__menu-danger .p-menuitem-text,
.shelf-card__menu-danger .p-menuitem-icon {
  color: var(--p-red-500, #dc2626);
}
</style>
