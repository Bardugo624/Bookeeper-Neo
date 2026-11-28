import type { BookFile } from '../books/bookFileApi';

/** «Leggi» opens the first of these that the book has. */
const ORDER = ['epub', 'mobi', 'azw3', 'fb2', 'cbz', 'pdf'];

const rank = (format: string) => {
  const i = ORDER.indexOf(format.toLowerCase());
  return i === -1 ? ORDER.length : i;
};

/**
 * The file to read: the one asked for (`?file=`) when the book has it, otherwise the best format,
 * the oldest of the same format. A file that is no longer on the server never counts.
 */
export function pickFile(files: BookFile[], wanted: string | null): BookFile | null {
  const readable = files.filter((f) => !f.missing);
  const asked = wanted ? readable.find((f) => f.id === wanted) : undefined;
  if (asked) return asked;
  return [...readable].sort((a, b) => rank(a.format) - rank(b.format) || a.created_at - b.created_at)[0] ?? null;
}
