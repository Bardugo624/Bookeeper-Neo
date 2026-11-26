import { positionLabel } from '@bookeeper/ui/shelf';
import type { Translate } from '../../app';

export interface WhereSpot {
  /** Name of the unit; a generic word stands in when it is not known (yet). */
  shelfName?: string | null;
  /** 0-based, as the API counts them. */
  row_index: number;
  slot_index: number;
}

/** "Mobile · ripiano 3 · posto 12", row and place counted from 1; with a title, «Titolo» comes first. */
export function wherePhrase(t: Translate, spot: WhereSpot, title?: string): string {
  const { row, slot } = positionLabel({ row: spot.row_index, slot: spot.slot_index });
  const vars = { shelf: spot.shelfName || t('shelves.where.unit'), row, slot };
  return title === undefined ? t('shelves.where.at', vars) : t('shelves.where.titled', { ...vars, title });
}
