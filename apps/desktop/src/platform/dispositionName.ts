/** The file name a `Content-Disposition` header proposes: `filename*` (UTF-8) first, then `filename`. */
export function dispositionName(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      const name = decodeURIComponent(star[1]!.trim());
      if (name) return name;
    } catch {
      // A broken escape falls back to the plain name.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const name = (plain?.[1] ?? plain?.[2] ?? '').trim();
  return name === '' ? null : name;
}
