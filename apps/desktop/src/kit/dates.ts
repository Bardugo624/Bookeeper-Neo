import type { Locale } from '@bookeeper/i18n';

export type DateStyle = 'short' | 'medium' | 'long';

export function formatDate(locale: Locale, unixSeconds: number, style: DateStyle = 'medium'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(new Date(unixSeconds * 1000));
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "today", "yesterday", "in 3 days", "10 days ago": whole local calendar days, not 24h blocks. */
export function formatRelativeDays(locale: Locale, unixSeconds: number, now: Date = new Date()): string {
  const days = Math.round((dayStart(new Date(unixSeconds * 1000)) - dayStart(now)) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

/** `YYYY-MM-DD` read in the local time zone at noon, so the day never slips with the offset. */
export function toUnixSeconds(dateInputValue: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInputValue);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return Math.floor(date.getTime() / 1000);
}

export function toDateInputValue(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
