/**
 * useShelfLayout — calcola dimensioni e geometria SVG per uno scaffale.
 *
 * Tutti i numeri sono in unità SVG: la card scala fluidamente con
 * `width="100%"` e `preserveAspectRatio` mantiene le proporzioni.
 */
import { computed, type Ref } from 'vue';
import type { Shelf } from '../types';

export interface ShelfLayout {
  /** Larghezza SVG in unità interne. */
  width: number;
  /** Altezza SVG in unità interne. */
  height: number;
  /** viewBox per lo `<svg>` root. */
  viewBox: string;
  /** Padding intorno alla cornice (left/top/right/bottom). */
  framePad: number;
  /** Larghezza singolo slot (un dorso libro standard). */
  slotW: number;
  /** Altezza dello scomparto / dei dorsi su ciascuna mensola. */
  slotH: number;
  /** Gap orizzontale tra dorsi adiacenti. */
  slotGap: number;
  /** Spessore del piano (mensola). */
  plankThickness: number;
  /** Gap verticale fra mensole (oltre lo spessore del piano). */
  rowGap: number;
  /** Coordinata X dell'inizio dell'area utile (post padding). */
  innerX: number;
  /** Coordinata Y della prima mensola. */
  innerY: number;
  /** Restituisce le coordinate (x,y,w,h) di uno slot specifico. */
  slotRect: (rowIndex: number, slotIndex: number, span?: 1 | 2 | 3) => {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** Coordinata Y del piano (linea sottostante) per una riga. */
  plankY: (rowIndex: number) => number;
}

export interface ShelfLayoutOptions {
  slotW?: number;
  slotH?: number;
  slotGap?: number;
  framePad?: number;
  plankThickness?: number;
  rowGap?: number;
}

export function useShelfLayout(
  shelf: Ref<Shelf | null | undefined>,
  options: ShelfLayoutOptions = {},
) {
  const layout = computed<ShelfLayout>(() => {
    const slotW = options.slotW ?? 14;
    const slotH = options.slotH ?? 56;
    const slotGap = options.slotGap ?? 1;
    const framePad = options.framePad ?? 12;
    const plankThickness = options.plankThickness ?? 3;
    const rowGap = options.rowGap ?? 6;

    const s = shelf.value;
    const rows = s?.rows ?? 1;
    const slotsPerRow = s?.slots_per_row ?? 1;

    const innerW =
      slotsPerRow * slotW + Math.max(0, slotsPerRow - 1) * slotGap;
    const rowH = slotH + plankThickness + rowGap;
    const innerH = rows * rowH - rowGap;

    const width = innerW + framePad * 2;
    const height = innerH + framePad * 2;

    const innerX = framePad;
    const innerY = framePad;

    return {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      framePad,
      slotW,
      slotH,
      slotGap,
      plankThickness,
      rowGap,
      innerX,
      innerY,
      slotRect: (rowIndex: number, slotIndex: number, span: 1 | 2 | 3 = 1) => ({
        x: innerX + slotIndex * (slotW + slotGap),
        y: innerY + rowIndex * (slotH + plankThickness + rowGap),
        w: span * slotW + (span - 1) * slotGap,
        h: slotH,
      }),
      plankY: (rowIndex: number) =>
        innerY + rowIndex * (slotH + plankThickness + rowGap) + slotH,
    };
  });

  return { layout };
}
