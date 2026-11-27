import type { Locale } from '@bookeeper/i18n';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** MB without decimals below 1 GB, GB with one decimal above: `24 MB`, `212,0 GB`. */
export function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  const gb = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / GB);
  return `${gb} GB`;
}
