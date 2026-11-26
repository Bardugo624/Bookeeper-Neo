/** Position of a book on a cabinet, 0-based as the API counts it. */
export interface Position {
  row: number;
  slot: number;
}

/** The same position counted from 1, as people read it. No text: apps compose the sentence with i18n. */
export function positionLabel(position: Position): { row: number; slot: number } {
  return { row: position.row + 1, slot: position.slot + 1 };
}
