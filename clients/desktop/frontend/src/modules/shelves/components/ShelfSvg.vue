<script setup lang="ts">
/**
 * ShelfSvg — render vettoriale di uno scaffale.
 *
 * Disegna mensole orizzontali, dorsi libro (rect) e slot vuoti.
 * Il componente è puramente di presentazione: lo stato vive nel
 * parent (dashboard / detail). Emette eventi per:
 *  - click su tutto lo scaffale (apertura dettaglio)
 *  - click su un singolo dorso libro (focus su libro)
 *  - click su uno slot vuoto (assegnazione di un libro)
 *
 * Accessibilità: lo `<svg>` ha `role="img"` con `aria-label` descrittivo;
 * ogni dorso libro contiene un `<title>` figlio (tooltip nativo SR) ed è
 * focusable via tastiera quando interattivo.
 */
import { computed, toRef } from 'vue';
import type { Shelf, ShelfBook } from '../types';
import { spineColorFromTitle, SHELF_COLOR_OPTIONS } from '../types';
import { useShelfLayout } from '../composables/useShelfLayout';

interface Props {
  shelf: Shelf;
  books?: ShelfBook[];
  /** Se vero abilita interazioni (click su dorsi e slot vuoti). */
  interactive?: boolean;
  /** Mostra label aria-friendly con titolo del libro nei tooltip. */
  showSpineTitles?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  books: () => [],
  interactive: true,
  showSpineTitles: true,
});

const emit = defineEmits<{
  /** Click sul corpo dello scaffale (zona vuota). */
  (e: 'open-shelf', shelfId: string): void;
  /** Click su un dorso libro. */
  (e: 'open-book', bookId: string): void;
  /** Click su uno slot vuoto. */
  (e: 'pick-slot', payload: { rowIndex: number; slotIndex: number }): void;
}>();

const shelfRef = toRef(props, 'shelf');
const { layout } = useShelfLayout(shelfRef);

const ariaLabel = computed(
  () =>
    `Scaffale ${props.shelf.name}: ${props.books.length} di ${props.shelf.rows * props.shelf.slots_per_row} libri`,
);

const colorSwatch = computed(() => {
  const found = SHELF_COLOR_OPTIONS.find((c) => c.value === props.shelf.color);
  return found?.swatch ?? '#7c8f6a';
});

interface SlotRender {
  key: string;
  rowIndex: number;
  slotIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  occupied?: ShelfBook;
  spineColor?: string;
}

/**
 * Pre-compute every slot (occupied + empty). Indexed by (row,slot) for
 * fast lookup of placements; complexity is O(rows*slotsPerRow), bounded
 * by 720 (SHELF_CAPACITY_MAX).
 */
const slots = computed<SlotRender[]>(() => {
  const map = new Map<string, ShelfBook>();
  for (const b of props.books) {
    map.set(`${b.row_index}:${b.slot_index}`, b);
  }
  const out: SlotRender[] = [];
  for (let r = 0; r < props.shelf.rows; r++) {
    for (let s = 0; s < props.shelf.slots_per_row; s++) {
      const occ = map.get(`${r}:${s}`);
      const rect = layout.value.slotRect(r, s, occ?.spine_width ?? 1);
      // Skip "covered" slots when an adjacent thick spine spans here.
      if (occ && occ.spine_width > 1) {
        // Mark the next (span-1) cells as covered to avoid double draw.
        for (let k = 1; k < occ.spine_width; k++) {
          map.set(`${r}:${s + k}`, occ);
        }
      }
      out.push({
        key: occ ? `book-${occ.book_id}` : `empty-${r}-${s}`,
        rowIndex: r,
        slotIndex: s,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        occupied: occ,
        spineColor: occ
          ? occ.spine_color || spineColorFromTitle(occ.title)
          : undefined,
      });
    }
  }
  // Filter out duplicate slots covered by a thick spine.
  const seen = new Set<string>();
  return out.filter((sl) => {
    const id = sl.occupied
      ? `b:${sl.occupied.book_id}`
      : `e:${sl.rowIndex}:${sl.slotIndex}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
});

function onSpineClick(book: ShelfBook): void {
  if (!props.interactive) return;
  emit('open-book', book.book_id);
}
function onSpineKey(book: ShelfBook, ev: KeyboardEvent): void {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    onSpineClick(book);
  }
}
function onEmptyClick(rowIndex: number, slotIndex: number): void {
  if (!props.interactive) return;
  emit('pick-slot', { rowIndex, slotIndex });
}
function onShelfClick(ev: MouseEvent): void {
  // Only fire if the click was on the SVG background, not on a slot.
  const target = ev.target as SVGElement;
  if (target.tagName.toLowerCase() === 'svg' || target.classList.contains('shelf__frame')) {
    emit('open-shelf', props.shelf.id);
  }
}
</script>

<template>
  <svg
    class="shelf"
    :class="`shelf--${shelf.color}`"
    :viewBox="layout.viewBox"
    role="img"
    :aria-label="ariaLabel"
    preserveAspectRatio="xMidYMid meet"
    @click="onShelfClick"
  >
    <!-- Cornice -->
    <rect
      class="shelf__frame"
      x="0"
      y="0"
      :width="layout.width"
      :height="layout.height"
      :stroke="colorSwatch"
      rx="6"
      ry="6"
    />

    <!-- Mensole -->
    <line
      v-for="r in shelf.rows"
      :key="`plank-${r - 1}`"
      class="shelf__plank"
      :x1="layout.innerX"
      :x2="layout.innerX + layout.width - layout.framePad * 2"
      :y1="layout.plankY(r - 1) + layout.plankThickness / 2"
      :y2="layout.plankY(r - 1) + layout.plankThickness / 2"
      :stroke-width="layout.plankThickness"
      :stroke="colorSwatch"
    />

    <!-- Slot (occupati + vuoti) -->
    <g
      v-for="sl in slots"
      :key="sl.key"
    >
      <!-- Slot vuoto -->
      <rect
        v-if="!sl.occupied"
        class="shelf__slot shelf__slot--empty"
        :x="sl.x"
        :y="sl.y"
        :width="sl.w"
        :height="sl.h"
        rx="1"
        :data-row="sl.rowIndex"
        :data-slot="sl.slotIndex"
        :tabindex="interactive ? 0 : -1"
        :aria-label="interactive ? `Slot vuoto riga ${sl.rowIndex + 1} posizione ${sl.slotIndex + 1}` : undefined"
        @click.stop="onEmptyClick(sl.rowIndex, sl.slotIndex)"
        @keydown.enter.prevent="onEmptyClick(sl.rowIndex, sl.slotIndex)"
        @keydown.space.prevent="onEmptyClick(sl.rowIndex, sl.slotIndex)"
      />
      <!-- Dorso libro -->
      <g v-else class="shelf__spine-wrap">
        <rect
          class="shelf__slot shelf__slot--occupied"
          :x="sl.x"
          :y="sl.y"
          :width="sl.w"
          :height="sl.h"
          :fill="sl.spineColor"
          rx="1.5"
          :tabindex="interactive ? 0 : -1"
          role="button"
          :aria-label="`Apri dettaglio libro ${sl.occupied.title}`"
          @click.stop="onSpineClick(sl.occupied)"
          @keydown="onSpineKey(sl.occupied, $event)"
        />
        <title v-if="showSpineTitles">{{ sl.occupied.title }}</title>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.shelf {
  display: block;
  width: 100%;
  height: auto;
  cursor: pointer;
  /* Niente animazioni di entrance: rispettiamo prefers-reduced-motion. */
}
.shelf__frame {
  fill: var(--p-surface-50);
  stroke-width: 2;
}
.shelf__plank {
  /* Mensola con sfumatura sottile per dare materialità. */
  opacity: 0.55;
}
.shelf__slot {
  transition: fill 200ms ease, opacity 150ms ease, transform 120ms ease;
}
.shelf__slot--empty {
  fill: var(--p-surface-200);
  opacity: 0.6;
}
.shelf__slot--empty:hover {
  fill: var(--p-primary-100, #e8efe1);
  opacity: 0.9;
}
.shelf__slot--occupied {
  cursor: pointer;
  /* sottile bordo scuro per dare profondità al dorso */
  stroke: rgba(0, 0, 0, 0.18);
  stroke-width: 0.5;
}
.shelf__slot--occupied:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}
.shelf__slot:focus-visible {
  outline: none;
  stroke: var(--p-primary-500);
  stroke-width: 2;
}
@media (prefers-reduced-motion: reduce) {
  .shelf__slot {
    transition: none;
  }
  .shelf__slot--occupied:hover {
    transform: none;
  }
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .shelf__frame {
  fill: var(--p-surface-800);
}
html.dark .shelf__slot--empty {
  fill: var(--p-surface-700);
  opacity: 0.7;
}
html.dark .shelf__slot--empty:hover {
  fill: color-mix(in srgb, var(--p-primary-500) 35%, transparent);
}
</style>
