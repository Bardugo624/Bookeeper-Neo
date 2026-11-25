import type { Locale } from '@bookeeper/i18n';

export const MAX_INTERVAL_DAYS = 90;
export const MIN_KEEP = 1;
export const MAX_KEEP = 50;
/** The client falls back to this name when the core sends no `content-disposition`. */
export const CLIENT_DEFAULT_NAME = 'bookeeper-backup.zip';

export function fallbackBackupName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `bookeeper-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

export function formatBytes(locale: Locale, bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(value);
  return `${num} ${units[i]}`;
}

export interface ScheduleValues {
  interval: string;
  keep: string;
}

export type ScheduleErrors = Partial<Record<keyof ScheduleValues, 'interval' | 'keep'>>;

function wholeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/** Same limits as the core: interval 0–90 (0 = off), keep 1–50. */
export function validateSchedule(v: ScheduleValues): { errors: ScheduleErrors; value: { interval_days: number; keep: number } | null } {
  const interval = wholeNumber(v.interval);
  const keep = wholeNumber(v.keep);
  const errors: ScheduleErrors = {};
  if (interval === null || interval > MAX_INTERVAL_DAYS) errors.interval = 'interval';
  if (keep === null || keep < MIN_KEEP || keep > MAX_KEEP) errors.keep = 'keep';
  if (errors.interval || errors.keep) return { errors, value: null };
  return { errors, value: { interval_days: interval!, keep: keep! } };
}

/** Reads a picked file; jsdom's `File` has no `arrayBuffer()`. */
export function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

export function formatDateTime(locale: Locale, unixSeconds: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unixSeconds * 1000));
}
