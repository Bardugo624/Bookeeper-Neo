import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ok } from '../../session/fixtures';
import type { ReadingOut } from '@bookeeper/api';
import { puts, reading, renderBlock, type ReadingServer } from './testkit';

beforeEach(() => localStorage.clear());
const block = async () => within(await screen.findByRole('region', { name: 'Lettura' }));

describe('page', () => {
  it('uses the numeric keyboard', async () => {
    renderBlock({ current: reading() });
    expect((await (await block()).findByRole('textbox', { name: 'Pagina corrente' })).getAttribute('inputmode')).toBe('numeric');
  });

  it('moves with plus and minus', async () => {
    const view = renderBlock({ current: reading() });
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Una pagina in più' }));
    await waitFor(() => expect(puts(view.platform.fake.calls)).toHaveLength(1));
    expect(puts(view.platform.fake.calls)[0]!.body).toMatchObject({ status: 'reading', current_page: 313 });
    await userEvent.click(b.getByRole('button', { name: 'Una pagina in meno' }));
    await waitFor(() => expect(puts(view.platform.fake.calls)).toHaveLength(2));
    expect(puts(view.platform.fake.calls)[1]!.body).toMatchObject({ current_page: 312 });
  });

  it('never goes past the pages of the book', async () => {
    const view = renderBlock({ current: reading({ current_page: 502 }) });
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Una pagina in più' }));
    await waitFor(() => expect((b.getByRole('button', { name: 'Una pagina in più' }) as HTMLButtonElement).disabled).toBe(true));
    const field = b.getByRole('textbox', { name: 'Pagina corrente' });
    await userEvent.clear(field);
    await userEvent.type(field, '900{Enter}');
    await waitFor(() => expect(puts(view.platform.fake.calls).length).toBeGreaterThan(0));
    expect(puts(view.platform.fake.calls).every((c) => (c.body as { current_page: number }).current_page <= 503)).toBe(true);
    expect((field as HTMLInputElement).value).toBe('503');
  });

  it('keeps the newest page when the answers come in reverse order', async () => {
    const releases: Array<() => void> = [];
    const server: ReadingServer = {
      current: reading(),
      // The server applies the writes in the order they were sent; only the answers come back late.
      put: (body) =>
        new Promise((resolve) => {
          server.current = { ...reading(), ...body } as ReadingOut;
          releases.push(() => resolve(ok({ ...reading(), ...body, updated_at: 1_700_000_100 }) as never));
        }),
    };
    const view = renderBlock(server);
    const b = await block();
    const more = await b.findByRole('button', { name: 'Una pagina in più' });
    await userEvent.click(more);
    await userEvent.click(more);
    await waitFor(() => expect(releases).toHaveLength(2));
    const field = b.getByRole('textbox', { name: 'Pagina corrente' }) as HTMLInputElement;
    expect(field.value).toBe('314');
    releases[1]!();
    await waitFor(() => expect(field.value).toBe('314'));
    releases[0]!();
    await new Promise((r) => setTimeout(r, 30));
    expect(field.value).toBe('314');
    expect(puts(view.platform.fake.calls).map((c) => (c.body as { current_page: number }).current_page)).toEqual([313, 314]);
  });
});
