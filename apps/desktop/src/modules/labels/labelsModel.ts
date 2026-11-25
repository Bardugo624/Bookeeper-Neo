// The core prints one fixed sheet: A4, 4 columns × 11 rows, from the first box, up to 2000 books per request.
export const SHEET_COLS = 4;
export const SHEET_ROWS = 11;
export const PER_SHEET = SHEET_COLS * SHEET_ROWS;
export const MAX_BOOKS = 2000;

export const sheetCount = (books: number) => Math.max(1, Math.ceil(books / PER_SHEET));

/** `etichette-yyyy-mm-dd.pdf`, with the local date. */
export function labelsFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `etichette-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.pdf`;
}
