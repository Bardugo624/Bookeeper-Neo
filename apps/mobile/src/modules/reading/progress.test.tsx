import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { optimisticReading, ringPercent } from './readingModel';
import { reading, renderBlock } from './testkit';

beforeEach(() => localStorage.clear());
const block = async () => within(await screen.findByRole('region', { name: 'Lettura' }));

describe('ring percent', () => {
  it('prefers the percent of the file over the page', () => {
    expect(ringPercent({ status: 'reading', current_page: 100, progress_percent: 41.6 }, 500)).toBe(42);
  });
  it('falls back to the page, and is full when read', () => {
    expect(ringPercent({ status: 'reading', current_page: 100, progress_percent: null }, 500)).toBe(20);
    expect(ringPercent({ status: 'read', progress_percent: 12 }, null)).toBe(100);
  });
  it('shows the percent of the file without the number of pages', async () => {
    renderBlock({ current: reading({ progress_percent: 37, progress_at: 1_700_000_050 }) }, { page_count: null });
    const ring = await (await block()).findByRole('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('37');
  });
});

describe('optimistic write', () => {
  it('keeps the percent and the time of the cached reading', () => {
    const previous = reading({ progress_percent: 55, progress_at: 1_700_000_050 });
    const next = optimisticReading('b1', { status: 'reading', current_page: 10 } as never, 503, previous);
    expect(next).toMatchObject({ progress_percent: 55, progress_at: 1_700_000_050 });
  });
});
