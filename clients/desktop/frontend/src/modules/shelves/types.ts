/**
 * modules/shelves/types.ts — DTO e costanti del modulo shelves.
 *
 * I limiti (rows / slotsPerRow) sono mirror dei CHECK SQL lato server e
 * della validazione in `server/internal/api/shelves.go`. Vanno tenuti
 * sincronizzati: se cambiano lì vanno aggiornati anche qui.
 */

export const SHELF_ROWS_MIN = 1;
export const SHELF_ROWS_MAX = 12;
export const SHELF_SLOTS_MIN = 5;
export const SHELF_SLOTS_MAX = 60;
export const SHELF_CAPACITY_MAX = SHELF_ROWS_MAX * SHELF_SLOTS_MAX; // 720

/** Token semantici per il colore della cornice scaffale. */
export type ShelfColor =
  | 'sage'
  | 'terracotta'
  | 'navy'
  | 'plum'
  | 'amber'
  | 'graphite';

export const SHELF_COLOR_OPTIONS: { value: ShelfColor; label: string; swatch: string }[] = [
  { value: 'sage',       label: 'Salvia',     swatch: '#7c8f6a' },
  { value: 'terracotta', label: 'Terracotta', swatch: '#b8704f' },
  { value: 'navy',       label: 'Notte',      swatch: '#3a4a6b' },
  { value: 'plum',       label: 'Prugna',     swatch: '#6b3a5f' },
  { value: 'amber',      label: 'Ambra',      swatch: '#c9954a' },
  { value: 'graphite',   label: 'Grafite',    swatch: '#4a4a4a' },
];

export interface Shelf {
  id: string;
  name: string;
  rows: number;
  slots_per_row: number;
  color: ShelfColor;
  icon?: string | null;
  capacity: number;
  book_count: number;
  created_at: number;
  updated_at: number;
}

export interface ShelfBook {
  book_id: string;
  shelf_id: string;
  row_index: number;
  slot_index: number;
  spine_color?: string | null;
  spine_width: 1 | 2 | 3;
  title: string;
  updated_at: number;
}

export interface ShelfInput {
  name: string;
  rows: number;
  slots_per_row: number;
  color: ShelfColor;
  icon: string;
}

export const EMPTY_SHELF_INPUT: ShelfInput = {
  name: '',
  rows: 5,
  slots_per_row: 20,
  color: 'sage',
  icon: '',
};

export interface ShelfAssignmentInput {
  shelf_id: string;
  row_index: number;
  slot_index: number;
  spine_color?: string | null;
  spine_width: 1 | 2 | 3;
}

export function shelfToInput(s: Shelf): ShelfInput {
  return {
    name: s.name,
    rows: s.rows,
    slots_per_row: s.slots_per_row,
    color: s.color,
    icon: s.icon ?? '',
  };
}

/**
 * Hash deterministico title → indice palette per scegliere un colore di
 * dorso libro stabile quando l'utente non ne specifica uno.
 */
export function spineColorFromTitle(title: string): string {
  const palette = [
    '#7c8f6a', // sage
    '#b8704f', // terracotta
    '#3a4a6b', // navy
    '#6b3a5f', // plum
    '#c9954a', // amber
    '#4a4a4a', // graphite
    '#8a7a5e', // sand
    '#5a7a8a', // steel
  ];
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(h) % palette.length];
}
