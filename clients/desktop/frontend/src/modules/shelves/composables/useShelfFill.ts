/**
 * useShelfFill — calcola percentuale di riempimento (totale + per mensola).
 */
import { computed, type Ref } from 'vue';
import type { Shelf, ShelfBook } from '../types';

export interface ShelfFill {
  filled: number;
  total: number;
  pct: number;
  /** Riempimento per ciascuna mensola (0..1). */
  perRow: number[];
  /** Soglia semantica derivata: ok | warn | danger. */
  level: 'ok' | 'warn' | 'danger';
}

export function useShelfFill(
  shelf: Ref<Shelf | null | undefined>,
  books: Ref<ShelfBook[]>,
) {
  const fill = computed<ShelfFill>(() => {
    const s = shelf.value;
    const total = s ? s.rows * s.slots_per_row : 0;
    const list = books.value ?? [];
    const filled = list.length;
    const pct = total > 0 ? filled / total : 0;
    const perRow: number[] = s
      ? new Array(s.rows).fill(0).map((_, idx) => {
          const occupied = list.filter((b) => b.row_index === idx).length;
          return s.slots_per_row > 0 ? occupied / s.slots_per_row : 0;
        })
      : [];
    let level: 'ok' | 'warn' | 'danger' = 'ok';
    if (pct >= 0.85) level = 'danger';
    else if (pct >= 0.5) level = 'warn';
    return { filled, total, pct, perRow, level };
  });

  return { fill };
}
