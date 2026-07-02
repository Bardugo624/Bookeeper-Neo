<script setup lang="ts">
/**
 * ShelfSvg — render vettoriale di uno scaffale, disegnato come un mobile
 * vero: cornice in legno colorato, fondale in ombra, mensole con spessore
 * e ombra portata, dorsi con altezza variabile appoggiati sulla mensola.
 *
 * Materiali (tutti SVG nativi, zero immagini):
 *  - cornice: fill nel colore scaffale + overlay gradiente "legno";
 *  - fondale: tinta scura derivata dal colore, con ombra sotto ogni piano;
 *  - dorsi: colore del libro + overlay gradiente orizzontale condiviso
 *    (luce a sinistra, ombra a destra) che dà cilindricità a ogni dorso;
 *  - altezze variabili deterministiche (hash del book_id): una fila di
 *    libri veri non è mai perfettamente pareggiata.
 *
 * Il componente è puramente di presentazione: lo stato vive nel parent.
 * Eventi: open-shelf (click sul mobile), open-book (dorso), pick-slot
 * (slot vuoto).
 *
 * Accessibilità: `role="img"` con `aria-label` descrittivo; ogni dorso è
 * un role="button" focusabile con `<title>` (tooltip nativo + SR).
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
  (e: 'open-shelf', shelfId: string): void;
  (e: 'open-book', bookId: string): void;
  (e: 'pick-slot', payload: { rowIndex: number; slotIndex: number }): void;
}>();

const shelfRef = toRef(props, 'shelf');
const { layout } = useShelfLayout(shelfRef);

// Id univoco per i defs: più ShelfSvg sulla stessa pagina non devono
// condividere gli id dei gradienti (url(#...) è globale nel documento).
const uid = Math.random().toString(36).slice(2, 8);

const ariaLabel = computed(
  () =>
    `Scaffale ${props.shelf.name}: ${props.books.length} di ${props.shelf.rows * props.shelf.slots_per_row} libri`,
);

const colorSwatch = computed(() => {
  const found = SHELF_COLOR_OPTIONS.find((c) => c.value === props.shelf.color);
  return found?.swatch ?? '#7c8f6a';
});

/** Scurisce un hex #rrggbb mescolandolo col nero (t: 0..1). */
function darken(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - t));
  const r = f((n >> 16) & 0xff);
  const g = f((n >> 8) & 0xff);
  const b = f(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const frameEdge = computed(() => darken(colorSwatch.value, 0.32)); // bordo cornice
const plankColor = computed(() => darken(colorSwatch.value, 0.18)); // piano mensola
// Fondale: scuro quanto basta a dare profondità, chiaro quanto basta a
// non inghiottire i dorsi (che sono a loro volta tinte tenui).
const backColor = computed(() => darken(colorSwatch.value, 0.45));

/** Altezza variabile del dorso: hash id → 86–100% dello slot. */
function spineHeightFactor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return 0.86 + (h % 8) * 0.02;
}

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
  /** Indice di stagger per l'entrance (cap per file lunghe). */
  stagger: number;
}

/**
 * Pre-compute every slot (occupied + empty). Indexed by (row,slot) for
 * fast lookup of placements; complexity is O(rows*slotsPerRow), bounded
 * by 720 (SHELF_CAPACITY_MAX). I dorsi sono ancorati in basso alla
 * mensola (bottom-aligned) così le altezze variabili leggono da libri
 * appoggiati, non appesi.
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
      if (occ && occ.spine_width > 1) {
        for (let k = 1; k < occ.spine_width; k++) {
          map.set(`${r}:${s + k}`, occ);
        }
      }
      let y = rect.y;
      let h = rect.h;
      if (occ) {
        h = Math.round(rect.h * spineHeightFactor(occ.book_id));
        y = rect.y + (rect.h - h); // bottom-aligned sulla mensola
      }
      out.push({
        key: occ ? `book-${occ.book_id}` : `empty-${r}-${s}`,
        rowIndex: r,
        slotIndex: s,
        x: rect.x,
        y,
        w: rect.w,
        h,
        occupied: occ,
        spineColor: occ
          ? occ.spine_color || spineColorFromTitle(occ.title)
          : undefined,
        stagger: Math.min(s, 16) + Math.min(r, 4) * 3,
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
  if (
    target.tagName.toLowerCase() === 'svg' ||
    target.classList.contains('shelf__frame') ||
    target.classList.contains('shelf__back') ||
    target.classList.contains('shelf__plank')
  ) {
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
    <defs>
      <!-- Cilindricità del dorso: luce a sinistra, ombra a destra.
           Un solo def riusato da tutti i dorsi, qualunque colore. -->
      <linearGradient :id="`spine-${uid}`" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.22" />
        <stop offset="0.28" stop-color="#fff" stop-opacity="0.04" />
        <stop offset="0.72" stop-color="#000" stop-opacity="0.05" />
        <stop offset="1" stop-color="#000" stop-opacity="0.24" />
      </linearGradient>
      <!-- Venatura del legno: overlay verticale su cornice e mensole. -->
      <linearGradient :id="`wood-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.14" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.02" />
        <stop offset="1" stop-color="#000" stop-opacity="0.16" />
      </linearGradient>
      <!-- Ombra portata della mensola superiore sul vano sottostante. -->
      <linearGradient :id="`niche-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.34" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- Cornice (mobile) -->
    <rect
      class="shelf__frame"
      x="0"
      y="0"
      :width="layout.width"
      :height="layout.height"
      :fill="colorSwatch"
      :stroke="frameEdge"
      stroke-width="1.5"
      rx="7"
      ry="7"
    />
    <rect
      x="0"
      y="0"
      :width="layout.width"
      :height="layout.height"
      :fill="`url(#wood-${uid})`"
      rx="7"
      ry="7"
      pointer-events="none"
    />

    <!-- Fondale della nicchia -->
    <rect
      class="shelf__back"
      :x="layout.innerX - 3"
      :y="layout.innerY - 3"
      :width="layout.width - layout.framePad * 2 + 6"
      :height="layout.height - layout.framePad * 2 + 6"
      :fill="backColor"
      rx="3"
    />

    <!-- Vani: ombra portata del "soffitto" (cornice o mensola sopra)
         sull'inizio di ogni riga. Parte dal bordo inferiore del piano
         superiore e sfuma dentro il vano. -->
    <rect
      v-for="r in shelf.rows"
      :key="`niche-${r - 1}`"
      :x="layout.innerX - 3"
      :y="r === 1
        ? layout.innerY - 3
        : layout.innerY + (r - 1) * (layout.slotH + layout.plankThickness + layout.rowGap) - layout.rowGap"
      :width="layout.width - layout.framePad * 2 + 6"
      :height="8 + (r === 1 ? 0 : layout.rowGap)"
      :fill="`url(#niche-${uid})`"
      pointer-events="none"
    />

    <!-- Slot (occupati + vuoti) -->
    <g v-for="sl in slots" :key="sl.key">
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
      <g
        v-else
        class="shelf__spine-wrap"
        :style="{ '--i': sl.stagger }"
      >
        <rect
          class="shelf__slot shelf__slot--occupied"
          :x="sl.x"
          :y="sl.y"
          :width="sl.w"
          :height="sl.h"
          :fill="sl.spineColor"
          rx="1.2"
          :tabindex="interactive ? 0 : -1"
          role="button"
          :aria-label="`Apri dettaglio libro ${sl.occupied.title}`"
          @click.stop="onSpineClick(sl.occupied)"
          @keydown="onSpineKey(sl.occupied, $event)"
        />
        <rect
          class="shelf__spine-shade"
          :x="sl.x"
          :y="sl.y"
          :width="sl.w"
          :height="sl.h"
          :fill="`url(#spine-${uid})`"
          rx="1.2"
          pointer-events="none"
        />
        <title v-if="showSpineTitles">{{ sl.occupied.title }}</title>
      </g>
    </g>

    <!-- Mensole (sopra i vani, sotto i dorsi già disegnati bottom-aligned:
         il piano copre l'appoggio e dà lo spessore del legno) -->
    <g v-for="r in shelf.rows" :key="`plank-${r - 1}`" pointer-events="none">
      <rect
        class="shelf__plank"
        :x="layout.innerX - 3"
        :y="layout.plankY(r - 1)"
        :width="layout.width - layout.framePad * 2 + 6"
        :height="layout.plankThickness"
        :fill="plankColor"
        rx="1"
      />
      <rect
        :x="layout.innerX - 3"
        :y="layout.plankY(r - 1)"
        :width="layout.width - layout.framePad * 2 + 6"
        :height="layout.plankThickness"
        :fill="`url(#wood-${uid})`"
        rx="1"
      />
    </g>
  </svg>
</template>

<style scoped>
.shelf {
  display: block;
  width: 100%;
  height: auto;
  cursor: pointer;
}

/* Entrance: i dorsi salgono al posto con uno stagger per colonna,
 * cap ~350ms totali. Default visibile (anima solo `from`): con
 * reduced-motion il reset globale azzera la durata. */
.shelf__spine-wrap {
  transform-box: fill-box;
  animation: bk-rise var(--bk-dur-slow) var(--bk-ease) backwards;
  animation-delay: calc(var(--i, 0) * 14ms);
}

.shelf__slot {
  transition:
    fill var(--bk-dur) var(--bk-ease),
    opacity var(--bk-dur-fast) var(--bk-ease),
    transform var(--bk-dur-fast) var(--bk-ease),
    filter var(--bk-dur-fast) var(--bk-ease);
  transform-box: fill-box;
}
.shelf__slot--empty {
  /* Visibile ma discreto: lo slot vuoto è un invito, non un buco. */
  fill: rgb(255 255 255 / 0.12);
}
.shelf__slot--empty:hover {
  fill: color-mix(in srgb, var(--p-primary-300) 45%, transparent);
}
.shelf__slot--occupied {
  cursor: pointer;
  stroke: rgb(0 0 0 / 0.25);
  stroke-width: 0.4;
}
/* Il libro si "sfila" dallo scaffale: sale di 2 unità e si illumina.
 * L'overlay shade lo segue via CSS sibling transform. */
.shelf__spine-wrap:hover .shelf__slot--occupied,
.shelf__spine-wrap:hover .shelf__spine-shade,
.shelf__slot--occupied:focus-visible {
  transform: translateY(-2.5px);
}
.shelf__spine-shade {
  transition: transform var(--bk-dur-fast) var(--bk-ease);
  transform-box: fill-box;
}
.shelf__spine-wrap:hover .shelf__slot--occupied {
  filter: brightness(1.1);
}
.shelf__slot:focus-visible {
  outline: none;
  stroke: #fff;
  stroke-width: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .shelf__spine-wrap:hover .shelf__slot--occupied,
  .shelf__spine-wrap:hover .shelf__spine-shade,
  .shelf__slot--occupied:focus-visible {
    transform: none;
  }
}
</style>
