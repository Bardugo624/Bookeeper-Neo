type T = (key: string, vars?: Record<string, string | number>) => string;

/** «9 min», «11 h 20 min», «meno di 1 min». */
export function formatMinutes(t: T, minutes: number): string {
  if (!(minutes >= 0.5)) return t('reader.time.under_a_minute');
  const total = Math.round(minutes);
  if (total < 60) return t('reader.time.min', { minutes: total });
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? t('reader.time.hours', { hours }) : t('reader.time.hours_min', { hours, minutes: rest });
}

/** «42%», and «0,4%» below 10% so the first chapters do not all read «0%». Takes a 0..1 fraction. */
export function formatPercent(fraction: number): string {
  const p = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * 100;
  const tenth = Math.round(p * 10) / 10;
  if (tenth >= 10) return `${Math.round(p)}%`;
  return `${tenth.toFixed(1).replace('.', ',')}%`;
}

export function percentOf(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * 100);
}
