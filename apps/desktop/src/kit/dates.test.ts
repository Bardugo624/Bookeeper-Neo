import { describe, expect, it } from 'vitest';
import { formatDate, formatRelativeDays, toDateInputValue, toUnixSeconds } from './dates';

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime() / 1000;
const now = new Date(2025, 5, 15, 9, 30);

describe('formatDate', () => {
  it('formats in both languages', () => {
    const ts = noon(2025, 3, 14);
    expect(formatDate('it', ts, 'long')).toBe('14 marzo 2025');
    expect(formatDate('en', ts, 'long')).toBe('March 14, 2025');
  });
});

describe('formatRelativeDays', () => {
  it.each([
    ['it', 0, 'oggi'],
    ['it', -1, 'ieri'],
    ['it', 3, 'tra 3 giorni'],
    ['it', -10, '10 giorni fa'],
    ['en', 0, 'today'],
    ['en', -1, 'yesterday'],
    ['en', 3, 'in 3 days'],
    ['en', -10, '10 days ago'],
  ] as const)('%s %i', (locale, delta, text) => {
    expect(formatRelativeDays(locale, noon(2025, 6, 15 + delta), now)).toBe(text);
  });
});

describe('date input conversion', () => {
  it('round-trips without slipping a day', () => {
    for (const v of ['2025-01-01', '2025-03-30', '2025-10-26', '2024-02-29', '2025-12-31']) {
      expect(toDateInputValue(toUnixSeconds(v)!)).toBe(v);
    }
  });

  it('reads the date at local noon and rejects bad input', () => {
    expect(toUnixSeconds('2025-03-14')).toBe(noon(2025, 3, 14));
    expect(toUnixSeconds('2025-02-30')).toBeNull();
    expect(toUnixSeconds('')).toBeNull();
  });
});
