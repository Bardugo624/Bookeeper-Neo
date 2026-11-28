import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx, type Call } from './fakeCtx';
import { reduceMotion, readingStats, renderStats, stats } from './testkit';

const PNG_B64 = 'iVBORw0KGgo=';
let calls: Call[];

beforeEach(() => {
  reduceMotion();
  const fake = fakeCtx();
  calls = fake.calls;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/png;base64,${PNG_B64}`);
  Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

const reading = readingStats(
  { year: 2024, books: 17, pages: 5123, by_month: [0, 0, 5, ...Array(9).fill(0)], by_genre: [{ value: 'Romanzo', count: 9 }] },
  [{ year: 2024, books: 17, pages: 5123 }],
);
const item = (n: number) => ({
  book_id: `b${n}`,
  status: 'read',
  updated_at: 1,
  progress_percent: null,
  progress_at: null,
  finished_at: Date.UTC(2024, 2, 1 + n) / 1000,
  book: { id: `b${n}`, title: `Libro ${n}`, authors: [], cover_color: null },
});

async function openPoster(extra = {}) {
  const out = renderStats({ stats: stats(), reading, readingList: { items: Array.from({ length: 15 }, (_, i) => item(i)), total: 15 }, ...extra }, 'it', '/stats?tab=reading');
  await userEvent.click(await screen.findByRole('button', { name: 'Il tuo anno in libri' }));
  return { ...out, dialog: await screen.findByRole('dialog', { name: 'Il tuo anno in libri' }) };
}

describe('Il tuo anno in libri', () => {
  it('draws the poster with the year, the numbers and at most twelve covers', async () => {
    const { dialog } = await openPoster();
    expect(within(dialog).getByRole('img', { name: 'Anteprima: il tuo 2024 in libri' })).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.fn === 'roundRect')).toHaveLength(12));
    const texts = calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual(expect.arrayContaining(['2024', '17', '5123', 'marzo', 'Romanzo']));
  });

  it('saves a PNG named after the year', async () => {
    const { dialog, platform } = await openPoster();
    const save = within(dialog).getByRole('button', { name: 'Salva immagine' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    const req = platform.saved[0]!;
    expect(req.suggestedName).toBe('bookeeper-2024.png');
    expect(req.mime).toBe('image/png');
    expect(Array.from(req.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('draws again when the dialog is closed and reopened', async () => {
    const { dialog } = await openPoster();
    await waitFor(() => expect(calls.filter((c) => c.fn === 'roundRect')).toHaveLength(12));
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Chiudi' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    calls.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Il tuo anno in libri' }));
    const again = await screen.findByRole('dialog', { name: 'Il tuo anno in libri' });
    await waitFor(() => expect(calls.filter((c) => c.fn === 'roundRect')).toHaveLength(12));
    await waitFor(() => expect(within(again).getByRole('button', { name: 'Salva immagine' })).toBeEnabled());
  });
});
