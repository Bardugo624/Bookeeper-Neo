import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { isCreate, isPut, renderTags, tag, type TagsServer } from './testkit';

beforeEach(() => localStorage.clear());

async function openSheet(server: TagsServer, have = [tag(1, { name: 'Giallo' })]) {
  const view = renderTags(server, have);
  await userEvent.click(await screen.findByRole('button', { name: 'Modifica tag' }));
  const sheet = within(await screen.findByRole('dialog'));
  await sheet.findByRole('checkbox', { name: 'Giallo' });
  return { view, sheet };
}
const library = () => [tag(1, { name: 'Giallo' }), tag(2, { name: 'Da regalare', color: 'plum' }), tag(3, { name: 'Gialli' })];
const puts = (v: { platform: { fake: { calls: Parameters<typeof isPut>[0][] } } }) => v.platform.fake.calls.filter(isPut);

describe('the sheet', () => {
  it('starts with the tags of the book checked, and sends the final set in one PUT', async () => {
    const { view, sheet } = await openSheet({ tags: library() });
    expect((sheet.getByRole('checkbox', { name: 'Giallo' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(sheet.getByRole('checkbox', { name: 'Da regalare' }));
    await userEvent.click(sheet.getByRole('checkbox', { name: 'Giallo' }));
    await userEvent.click(sheet.getByRole('checkbox', { name: 'Gialli' }));
    expect(puts(view)).toHaveLength(0);
    await userEvent.click(sheet.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toEqual({ tag_ids: ['t2', 't3'] });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('filters the list by name, ignoring case', async () => {
    const { sheet } = await openSheet({ tags: library() });
    await userEvent.type(sheet.getByRole('searchbox'), 'REGAL');
    expect(sheet.queryByRole('checkbox', { name: 'Giallo' })).toBeNull();
    expect(sheet.getByRole('checkbox', { name: 'Da regalare' })).toBeTruthy();
  });

  it('offers "Create" only when no tag has that name', async () => {
    const { sheet } = await openSheet({ tags: library() });
    await userEvent.type(sheet.getByRole('searchbox'), 'giallo');
    expect(sheet.queryByRole('button', { name: /^Crea/ })).toBeNull();
    await userEvent.type(sheet.getByRole('searchbox'), 'zzz');
    expect(sheet.getByRole('button', { name: 'Crea «giallozzz»' })).toBeTruthy();
  });

  it('creates a tag in the least used color, checks it and saves with one PUT', async () => {
    const { view, sheet } = await openSheet({ tags: library() });
    await userEvent.type(sheet.getByRole('searchbox'), 'Nuovo');
    await userEvent.click(sheet.getByRole('button', { name: 'Crea «Nuovo»' }));
    const made = await sheet.findByRole('checkbox', { name: 'Nuovo' });
    expect((made as HTMLInputElement).checked).toBe(true);
    const post = view.platform.fake.calls.find(isCreate)!;
    expect(post.body).toEqual({ name: 'Nuovo', color: 'terracotta' });
    await userEvent.click(sheet.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toEqual({ tag_ids: ['t1', 'n4'] });
  });

  it('keeps the sheet and the choices open when saving fails', async () => {
    const { view, sheet } = await openSheet({
      tags: library(),
      put: () => ({ status: 500, body: { error_code: 'internal', message: 'x' } }),
    });
    await userEvent.click(sheet.getByRole('checkbox', { name: 'Da regalare' }));
    await userEvent.click(sheet.getByRole('button', { name: 'Salva' }));
    expect(await sheet.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((sheet.getByRole('checkbox', { name: 'Da regalare' }) as HTMLInputElement).checked).toBe(true);
    expect(puts(view)).toHaveLength(1);
  });

  it('says why when creating fails and sends nothing', async () => {
    const { view, sheet } = await openSheet({ tags: library(), failCreate: true });
    await userEvent.type(sheet.getByRole('searchbox'), 'Nuovo');
    await userEvent.click(sheet.getByRole('button', { name: 'Crea «Nuovo»' }));
    expect(await sheet.findByRole('alert')).toBeTruthy();
    expect(puts(view)).toHaveLength(0);
  });
});

describe('when the tag list fails', () => {
  it('shows the error with "Riprova" and never offers "Crea"', async () => {
    const view = renderTags({ tags: [], failList: true }, []);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica tag' }));
    const sheet = within(await screen.findByRole('dialog'));
    expect(await sheet.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    await userEvent.type(sheet.getByRole('searchbox'), 'Nuovo');
    expect(sheet.queryByRole('button', { name: /^Crea/ })).toBeNull();
    expect(view.platform.fake.calls.some(isCreate)).toBe(false);
  });
});
