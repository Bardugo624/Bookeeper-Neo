/** The file of the book list that the reader needs: `BookFileOut` of the API (not exported by the client). */
export interface BookFile {
  id: string;
  format: string;
  name: string;
  sha256: string;
  size_bytes: number;
  created_at: number;
  missing: boolean;
}

/** The formats «Leggi» tries, in order: reflowable ones first, the PDF last. */
const ORDER = ['epub', 'mobi', 'azw3', 'fb2', 'cbz', 'pdf'];

const rank = (f: BookFile) => {
  const i = ORDER.indexOf(f.format.toLowerCase());
  return i < 0 ? ORDER.length : i;
};

/**
 * The file to open: the one the link names, or the best format, the oldest among equals.
 * A file that is missing on the server comes after the ones that are there.
 */
export function pickFile(files: BookFile[], wanted: string | null): BookFile | null {
  const named = wanted ? files.find((f) => f.id === wanted) : undefined;
  if (named) return named;
  return [...files].sort((a, b) => Number(a.missing) - Number(b.missing) || rank(a) - rank(b) || a.created_at - b.created_at)[0] ?? null;
}
