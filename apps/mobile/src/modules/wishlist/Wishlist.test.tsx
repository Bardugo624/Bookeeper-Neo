import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { other, renderWishlist, wish, wishPlatform, writes } from './testkit';

const row = (name: string) => screen.findByRole('button', { name: new RegExp(name) });

describe('the choice', () => {
  it('shows my list first and switches to the family, grouped by person', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({
      mine: [wish()],
      family: [other(), wish(), wish({ id: 'w2', title: 'Hyperion', authors: null })],
    });
    const { router } = renderWishlist(platform);
    expect(await screen.findByText('Dune')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'La mia' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Famiglia' }));
    await screen.findByText('Emma');
    expect(router.state.location.search).toBe('?scope=family');
    const groups = screen.getAllByRole('region').map((g) => g.getAttribute('aria-label')).filter(Boolean);
    expect(groups).toEqual(['Tu', 'Bruno']);
    expect(within(screen.getByRole('region', { name: 'Tu' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('moves through the choice with the arrow keys, one stop in the tab order', async () => {
    const user = userEvent.setup();
    renderWishlist(wishPlatform({ mine: [wish()], family: [other()] }));
    await screen.findByText('Dune');
    expect(screen.getByRole('radio', { name: 'La mia' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Famiglia' })).toHaveAttribute('tabindex', '-1');
    screen.getByRole('radio', { name: 'La mia' }).focus();
    await user.keyboard('{ArrowRight}');
    await screen.findByText('Emma');
    expect(screen.getByRole('radio', { name: 'Famiglia' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Famiglia' })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens on the family when the address says so', async () => {
    const platform = wishPlatform({ mine: [wish()], family: [other()] });
    renderWishlist(platform, '/wishlist?scope=family');
    expect(await screen.findByText('Emma')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Famiglia' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows only the family to a guest, with nothing to write', async () => {
    const platform = wishPlatform({ role: 'guest', mine: [wish()], family: [other(), wish()] });
    renderWishlist(platform);
    expect(await screen.findByText('Emma')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aggiungi' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Dune/ })).toBeNull();
    expect(platform.fake.calls.some((c) => c.path === '/api/v1/wishlist')).toBe(false);
  });

  it('says so when a list is empty', async () => {
    renderWishlist(wishPlatform());
    expect(await screen.findByText('La tua wishlist è vuota')).toBeInTheDocument();
  });
});

describe('writing', () => {
  it('adds a wish', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform();
    renderWishlist(platform);
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aggiungi alla wishlist' }));
    expect(await within(dialog).findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(writes(platform)).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Titolo'), 'Emma');
    await user.type(within(dialog).getByLabelText('Autori'), 'Jane Austen');
    await user.type(within(dialog).getByLabelText('ISBN'), '9780306406157');
    await user.click(within(dialog).getByRole('radio', { name: 'Alta' }));
    await user.click(within(dialog).getByRole('button', { name: 'Aggiungi alla wishlist' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform).map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/api/v1/wishlist', { title: 'Emma', priority: 2, isbn: '9780306406157', authors: 'Jane Austen' }],
    ]);
  });

  it('edits an own wish', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({ mine: [wish()] });
    renderWishlist(platform);
    await user.click(await row('Dune'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Modifica' }));
    const title = await screen.findByLabelText('Titolo');
    expect(title).toHaveValue('Dune');
    await user.clear(title);
    await user.type(title, 'Dune Messiah');
    await user.clear(screen.getByLabelText('Autori'));
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform).map((c) => [c.method, c.path, c.body])).toEqual([
      ['PATCH', '/api/v1/wishlist/w1', { title: 'Dune Messiah', priority: 1, isbn: null, authors: null }],
    ]);
  });

  it('deletes only after the confirmation', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({ mine: [wish()] });
    renderWishlist(platform);
    await user.click(await row('Dune'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }));
    expect(await screen.findByText(/sarà tolto dalla wishlist/)).toBeInTheDocument();
    expect(writes(platform)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(await screen.findByRole('button', { name: 'Modifica' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elimina' }));
    await user.click(await screen.findByRole('button', { name: 'Sì, elimina' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform).map((c) => [c.method, c.path])).toEqual([['DELETE', '/api/v1/wishlist/w1']]);
  });

  it('converts to a book and opens its page', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({ mine: [wish()] });
    const { router } = renderWishlist(platform);
    await user.click(await row('Dune'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Ce l'ho: aggiungilo alla libreria" }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/nb'));
    expect(writes(platform).map((c) => [c.method, c.path])).toEqual([['POST', '/api/v1/wishlist/w1/convert']]);
  });

  it('shows the error of a failed write and stays open', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({
      mine: [wish()],
      extra: (c) => (c.method === 'DELETE' ? { status: 500, body: { error_code: 'internal', message: 'x' } } : undefined),
    });
    renderWishlist(platform);
    await user.click(await row('Dune'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }));
    await user.click(await screen.findByRole('button', { name: 'Sì, elimina' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Qualcosa è andato storto');
  });
});

describe('after a failed conversion', () => {
  it('clears the error when moving on to "Modifica"', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({
      mine: [wish()],
      extra: (c) => (c.path.endsWith('/convert') ? { status: 500, body: { error_code: 'internal', message: 'x' } } : undefined),
    });
    renderWishlist(platform);
    await user.click(await row('Dune'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: "Ce l'ho: aggiungilo alla libreria" }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Modifica' }));
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull();
  });
});

describe("other people's wishes", () => {
  it('are read-only: no row opens a sheet', async () => {
    const user = userEvent.setup();
    const platform = wishPlatform({ family: [other(), wish()] });
    renderWishlist(platform, '/wishlist?scope=family');
    expect(await screen.findByText('Emma')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Emma/ })).toBeNull();
    await user.click(screen.getByText('Emma'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Dune/ })).toBeInTheDocument();
  });
});
