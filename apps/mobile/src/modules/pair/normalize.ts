/** The pairing code as the core reads it: no spaces or dashes, capitals. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}
