import type { Locale } from '@bookeeper/i18n';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Whole MB while they round below 1024, then GB with one decimal, in the language on show: `24 MB`, `1,0 GB`, `212,0 GB`. */
export function formatBytes(bytes: number, locale: Locale): string {
  const mb = Math.round(bytes / MB);
  if (mb < 1024) return `${new Intl.NumberFormat(locale).format(mb)} MB`;
  const gb = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / GB);
  return `${gb} GB`;
}
