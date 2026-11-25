import type { NewShelf, ShelfOut, ShelfPatch } from '@bookeeper/api';
import { COLOR_NAMES, LIMITS, type ColorName } from './model';

/** Form values are text so a half-typed number does not jump around. */
export interface ShelfValues {
  name: string;
  color: ColorName;
  rows: string;
  slots_per_row: string;
}

export const EMPTY_VALUES: ShelfValues = { name: '', color: 'sage', rows: '4', slots_per_row: '20' };

export function valuesOf(s: ShelfOut): ShelfValues {
  const color = (COLOR_NAMES as readonly string[]).includes(s.color) ? (s.color as ColorName) : 'sage';
  return { name: s.name, color, rows: String(s.rows), slots_per_row: String(s.slots_per_row) };
}

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);

export function validateShelf(v: ShelfValues): Partial<Record<keyof ShelfValues, string>> {
  const errors: Partial<Record<keyof ShelfValues, string>> = {};
  const name = v.name.trim();
  if (!name) errors.name = 'required';
  else if (name.length > LIMITS.name) errors.name = 'tooLong';
  const rows = whole(v.rows);
  if (!(rows >= LIMITS.minRows && rows <= LIMITS.maxRows)) errors.rows = 'rows';
  const slots = whole(v.slots_per_row);
  if (!(slots >= LIMITS.minSlots && slots <= LIMITS.maxSlots)) errors.slots_per_row = 'slots';
  return errors;
}

export function createBody(v: ShelfValues): NewShelf {
  return { name: v.name.trim(), color: v.color, rows: whole(v.rows), slots_per_row: whole(v.slots_per_row) };
}

/** Only what changed, so an untouched shelf sends nothing it could be refused for. */
export function patchBody(shelf: ShelfOut, v: ShelfValues): ShelfPatch {
  const next = createBody(v);
  const patch: ShelfPatch = {};
  if (next.name !== shelf.name) patch.name = next.name;
  if (next.color !== shelf.color) patch.color = next.color;
  if (next.rows !== shelf.rows) patch.rows = next.rows;
  if (next.slots_per_row !== shelf.slots_per_row) patch.slots_per_row = next.slots_per_row;
  return patch;
}
