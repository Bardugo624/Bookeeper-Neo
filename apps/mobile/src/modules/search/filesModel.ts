/** `BookFileOut` of the API; `@bookeeper/api` has no client method or export for it yet. */
export interface BookFileOut {
  id: string;
  book_id: string;
  format: string;
  size_bytes: number;
  name: string;
  sha256: string;
  created_at: number;
  missing: boolean;
}

/** The six formats the core accepts, as the file picker's `accept`. */
export const FILE_ACCEPT = '.epub,.pdf,.mobi,.azw3,.fb2,.cbz';

/** Guests read only: the file routes answer 403 to them. */
export const canSeeFiles = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';

/** Size with the unit that fits, in the reader's language. */
export function formatSize(locale: string, bytes: number): string {
  const [value, unit] =
    bytes >= 1024 * 1024 ? [bytes / (1024 * 1024), 'megabyte'] : bytes >= 1024 ? [bytes / 1024, 'kilobyte'] : [bytes, 'byte'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: value < 10 && unit !== 'byte' ? 1 : 0 }).format(value);
}

/** Name the server suggests in `Content-Disposition`, or `fallback`. */
export function filenameFrom(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*\s*=\s*(?:[\w-]+)?''([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* use the plain one */
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(disposition);
  const name = (plain?.[1] ?? plain?.[2] ?? '').trim();
  return name === '' ? fallback : name;
}
