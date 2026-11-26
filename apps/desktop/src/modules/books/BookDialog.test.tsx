import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIntersectionObserver, book } from './testkit';
import { ISBN, METADATA, lookUp, openGroup, openNewBook, renderWithWrites, stored } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.restoreAllMocks());

const group = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const isWide = (dialog: HTMLElement) => dialog.className.includes('wide');

describe('"New book" grows', () => {
  it('starts as the ISBN field alone, a small dialog', async () => {
    renderWithWrites({ books: [] });
    const dialog = await openNewBook();
    expect(within(dialog).getByRole('textbox', { name: 'ISBN' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Cerca' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Titolo' })).toBeNull();
    expect(isWide(dialog)).toBe(false);
  });

  it('becomes the wide sheet after the search, with the focus on the title', async () => {
    renderWithWrites({ books: [] });
    const dialog = await openNewBook();
    await lookUp();
    expect(await within(dialog).findByRole('textbox', { name: 'Titolo' })).toHaveFocus();
    expect(isWide(dialog)).toBe(true);
    expect(within(dialog).queryByRole('textbox', { name: 'ISBN' })).toBeNull();
  });

  it('becomes the wide sheet with "Inserisci a mano", every group folded', async () => {
    renderWithWrites({ books: [] });
    const dialog = await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    expect(await screen.findByRole('textbox', { name: 'Titolo' })).toHaveFocus();
    expect(isWide(dialog)).toBe(true);
    for (const name of ['Edizione', 'Raccolta', 'Note']) {
      expect(group(name)).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByRole('textbox', { name: 'Lingua' })).toBeNull();
  });

  it('opens the groups the search filled in and folds the others', async () => {
    // Pages, language and the ISBN fill the edition; the search knows nothing of the collection or the notes.
    renderWithWrites({ books: [] }, {
      [`GET /api/v1/lookup/isbn/${ISBN}`]: () => ({ status: 200, body: { ...METADATA, genre: null, description: null } }),
    });
    await openNewBook();
    await lookUp();
    await screen.findByRole('textbox', { name: 'Titolo' });
    expect(group('Edizione')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Pagine' })).toHaveValue('503');
    expect(group('Note')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Raccolta')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('textbox', { name: 'Editore' })).toHaveValue('Bompiani');
  });

  it('opens a folded group on click, showing its fields, and counts what it holds', async () => {
    renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    const toggle = await screen.findByRole('button', { name: 'Edizione' });
    expect(toggle).toHaveAttribute('aria-controls');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.type(screen.getByRole('textbox', { name: 'Lingua' }), 'it');
    await userEvent.click(toggle);
    expect(screen.queryByRole('textbox', { name: 'Lingua' })).toBeNull();
    expect(toggle).toHaveAccessibleName('Edizione 1 compilato');
  });

  it('opens a folded group that holds a validation error and focuses the field', async () => {
    renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Titolo' }), 'Dune');
    await openGroup('Edizione');
    await userEvent.type(screen.getByRole('textbox', { name: 'Pagine' }), '0');
    await userEvent.click(group('Edizione'));
    expect(group('Edizione')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(group('Edizione')).toHaveAttribute('aria-expanded', 'true'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Pagine' })).toHaveFocus());
  });

  it('"Salva e aggiungi un altro" brings the small ISBN dialog back', async () => {
    renderWithWrites({ books: [] });
    const dialog = await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Titolo' }), 'Dune');
    expect(isWide(dialog)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Salva e aggiungi un altro' }));
    const again = await screen.findByRole('textbox', { name: 'ISBN' });
    expect(again).toHaveValue('');
    expect(isWide(screen.getByRole('dialog', { name: 'Nuovo libro' }))).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Titolo' })).toBeNull();
  });
});

describe('"Edit book"', () => {
  it('opens straight on the wide sheet with the values, and the groups that hold some open', async () => {
    renderWithWrites({ books: [stored({ genre: null, notes: null, description: null })] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifica libro' });
    expect(isWide(dialog)).toBe(true);
    expect(within(dialog).queryByRole('textbox', { name: 'ISBN' })).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Titolo' })).toHaveValue('Dune');
    expect(within(dialog).getByRole('textbox', { name: 'Editore' })).toHaveValue('Nord');
    expect(group('Edizione')).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Pagine' })).toHaveValue('500');
    expect(group('Note')).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('button', { name: 'Salva e aggiungi un altro' })).toBeNull();
  });
});

describe('origin', () => {
  /** The elements the dialog measured at birth: the opener is one of them. */
  function spyOrigins() {
    const measured: Element[] = [];
    const rect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      measured.push(this);
      return rect.call(this);
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    HTMLElement.prototype.animate = vi.fn(() => ({ cancel() {}, addEventListener() {} })) as never;
    return measured;
  }
  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
  });

  it('"Aggiungi" gives its button to the dialog', async () => {
    renderWithWrites({ books: [book(1)] });
    const measured = spyOrigins();
    const button = await screen.findByRole('button', { name: 'Aggiungi' });
    await userEvent.click(button);
    await screen.findByRole('dialog', { name: 'Nuovo libro' });
    expect(measured).toContain(button);
  });

  it('"Modifica" gives its button to the dialog', async () => {
    renderWithWrites({ books: [stored()] }, {}, '/books/b1');
    const measured = spyOrigins();
    const button = await screen.findByRole('button', { name: 'Modifica' });
    await userEvent.click(button);
    await screen.findByRole('dialog', { name: 'Modifica libro' });
    expect(measured).toContain(button);
  });

  it('the palette route opens it without an origin', async () => {
    renderWithWrites({ books: [book(1)] }, {}, '/books?new=1');
    const measured = spyOrigins();
    await screen.findByRole('dialog', { name: 'Nuovo libro' });
    expect(measured).not.toContain(screen.getByRole('button', { name: 'Aggiungi', hidden: true }));
  });
});
