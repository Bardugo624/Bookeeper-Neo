import { describe, expect, it } from 'vitest';
import { optimisticReading, ringPercent } from './readingModel';

describe('ringPercent', () => {
  it('uses the position when there is one', () => {
    expect(ringPercent({ status: 'reading', current_page: 10, progress_percent: 41.6 }, 100)).toBe(42);
    expect(ringPercent({ status: 'reading', progress_percent: 7 }, null)).toBe(7);
  });

  it('falls back to the page count', () => {
    expect(ringPercent({ status: 'reading', current_page: 25, progress_percent: null }, 100)).toBe(25);
    expect(ringPercent({ status: 'reading', current_page: 25 }, null)).toBeNull();
  });

  it('is full when read, whatever the position says', () => {
    expect(ringPercent({ status: 'read', progress_percent: 62 }, null)).toBe(100);
  });
});

describe('optimisticReading', () => {
  const body = { status: 'reading' as const, current_page: 5 };

  it('keeps the position and its time from the cached reading', () => {
    const out = optimisticReading('b1', body, 100, { progress_percent: 41, progress_at: 1_700_000_100 });
    expect(out).toMatchObject({ progress_percent: 41, progress_at: 1_700_000_100 });
  });

  it('has none when there was none', () => {
    expect(optimisticReading('b1', body, 100, null)).toMatchObject({ progress_percent: null, progress_at: null });
    expect(optimisticReading('b1', body, 100)).toMatchObject({ progress_percent: null, progress_at: null });
  });
});
