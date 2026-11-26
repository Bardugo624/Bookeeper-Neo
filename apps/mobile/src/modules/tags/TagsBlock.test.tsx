import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderTags, tag } from './testkit';

beforeEach(() => localStorage.clear());
const block = async () => within(await screen.findByRole('region', { name: 'Tag' }));

describe('the block', () => {
  it('lists the tags of the book, each a link to the filtered search', async () => {
    renderTags({ tags: [] }, [tag(1, { name: 'Giallo' }), tag(2, { name: 'Da regalare' })]);
    const b = await block();
    expect(b.getByRole('link', { name: 'Giallo' }).getAttribute('href')).toBe('/search?tag=t1');
    expect(b.getByRole('link', { name: 'Da regalare' }).getAttribute('href')).toBe('/search?tag=t2');
  });

  it('touching a tag opens the search filtered by it', async () => {
    const view = renderTags({ tags: [] }, [tag(1, { name: 'Giallo' })]);
    await userEvent.click((await (await block()).findByRole('link', { name: 'Giallo' })));
    await waitFor(() => expect(view.platform.fake.calls.some((c) => c.path.startsWith('/api/v1/books?'))).toBe(true));
    expect(await screen.findByRole('searchbox')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Tag' })).toBeNull();
  });

  it('without tags but with permission still offers the edit button', async () => {
    renderTags({ tags: [] });
    const b = await block();
    expect(b.getByText('Nessun tag.')).toBeTruthy();
    expect(b.getByRole('button', { name: 'Modifica tag' })).toBeTruthy();
  });

  it('without tags and without permission is not shown', async () => {
    renderTags({ tags: [], role: 'guest' });
    await screen.findByText('Non collocato');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Tag' })).toBeNull());
  });

  it('a guest sees the tags but no edit button', async () => {
    renderTags({ tags: [], role: 'guest' }, [tag(1, { name: 'Giallo' })]);
    const b = await block();
    expect(b.getByRole('link', { name: 'Giallo' })).toBeTruthy();
    expect(b.queryByRole('button', { name: 'Modifica tag' })).toBeNull();
  });
});
