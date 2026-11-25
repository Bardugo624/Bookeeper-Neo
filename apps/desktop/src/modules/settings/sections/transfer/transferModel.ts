import type { ImportFormat, ImportRowError } from '@bookeeper/api';

/** Largest body `POST /import` accepts (`IMPORT_BODY_LIMIT` in the core). */
export const IMPORT_LIMIT_BYTES = 10 * 1024 * 1024;
export const IMPORT_LIMIT_MB = IMPORT_LIMIT_BYTES / (1024 * 1024);
/** Rows of the error table shown at once. */
export const MAX_VISIBLE_ERRORS = 100;

export const IMPORT_FORMATS: readonly ImportFormat[] = ['auto', 'goodreads', 'calibre', 'librarything'];
export type ExportFormat = 'json' | 'csv';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['json', 'csv'];

export const EXPORT_MIME: Record<ExportFormat, string> = { json: 'application/json', csv: 'text/csv' };

export function isImportFormat(v: string): v is ImportFormat {
  return (IMPORT_FORMATS as readonly string[]).includes(v);
}

export function isExportFormat(v: string): v is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(v);
}

/** `bookeeper-<library>-<yyyy-mm-dd>.<ext>`, safe as a file name. */
export function exportFileName(library: string, date: Date, ext: ExportFormat): string {
  const safe = library.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || 'library';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `bookeeper-${safe}-${day}.${ext}`;
}

function cell(value: string): string {
  // A spreadsheet would run a leading = + - @ as a formula.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The rows with an error as CSV text (`row,message`). */
export function errorsToCsv(errors: readonly ImportRowError[]): string {
  const lines = ['row,message', ...errors.map((e) => `${e.row},${cell(e.message)}`)];
  return `${lines.join('\r\n')}\r\n`;
}

/** Bytes of the JSON body `POST /import` receives for this text: what the server's limit applies to. */
export function importBodyBytes(format: ImportFormat, content: string): number {
  return new TextEncoder().encode(JSON.stringify({ format, content, dry_run: false })).length;
}

/** jsdom's `File` has no `text()`/`arrayBuffer()`, so read through `FileReader`. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}
