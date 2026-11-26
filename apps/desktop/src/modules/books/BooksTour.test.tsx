import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { firstBook } from '../tour/firstBook';
import { module as tour } from '../tour/routes';
import { isTourPending } from '../tour/storage';
import { resetTourForTest, useTourStore } from '../tour/store';
import { book, booksPlatform, installIntersectionObserver, type Library } from './testkit';
import { module as books } from './routes';
import { writeRoutes } from './writeKit';

const other: AppModule = { id: 'other', routes: [{ path: '/other', element: <h1>Altrove</h1> }] };
// Each anchor gets its own x, so the lamp's position says which anchor it is on.
const X: Record<string, number> = { 'nav.books': 10, 'books.addFirst': 20, 'books.add': 30, 'book.isbn': 40, 'book.save': 50 };

function install() {
  installIntersectionObserver();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-tour');
    const x = id ? (X[id] ?? 5) : 0;
    const on = id || this.getAttribute('role') === 'dialog';
    return { x, y: 100, left: x, top: 100, width: on ? 80 : 0, height: on ? 32 : 0, right: x + 80, bottom: 132, toJSON: () => ({}) } as DOMRect;
  });
}

function show(lib: Partial<Library> = {}, route = '/books') {
  const handler = writeRoutes();
  const platform = booksPlatform({ books: [], ...lib, extra: (r) => handler(r) });
  return renderApp({ platform, modules: [books, other, tour], route });
}

const spotAt = () => (document.querySelector('[data-tour-spotlight] > div') as HTMLElement | null)?.style.transform;
const lampOn = (id: string) => expect(spotAt()).toBe(`translate(${X[id]! - 8}px, 92px)`);
const card = () => screen.getByRole('region', { name: /./ });
const state = () => useTourStore.getState();

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
  localStorage.setItem('bookeeper.tour.pending.c1', '1');
  install();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('start', () => {
  it('starts firstBook for a new person who can write into an empty library, and drops the mark', async () => {
    show();
    await screen.findByRole('button', { name: 'Aggiungi il primo libro' });
    await waitFor(() => expect(state().status).toBe('running'));
    expect(state().pathId).toBe('firstBook');
    expect(isTourPending('c1')).toBe(false);
  });

  it('does not start for a guest, and keeps the mark', async () => {
    show({ role: 'guest' });
    await screen.findByText('Nessun libro');
    expect(state().status).toBe('idle');
    expect(isTourPending('c1')).toBe(true);
  });

  it('does not start when the library already has books, and keeps the mark', async () => {
    show({ books: [book(1)] });
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    expect(state().status).toBe('idle');
    expect(isTourPending('c1')).toBe(true);
  });

  it('does not start without the mark', async () => {
    localStorage.clear();
    show();
    await screen.findByRole('button', { name: 'Aggiungi il primo libro' });
    expect(state().status).toBe('idle');
  });
});

describe('step 1', () => {
  it('lights Books from another page, then follows the person to the empty library', async () => {
    const view = show({}, '/other');
    await screen.findByRole('heading', { name: 'Altrove' });
    await waitFor(() => expect(state().status).toBe('running'));
    await waitFor(() => lampOn('nav.books'));
    expect(card()).toHaveTextContent('Apri i Libri');
    await act(async () => void (await view.router.navigate('/books')));
    await screen.findByRole('button', { name: 'Aggiungi il primo libro' });
    await waitFor(() => lampOn('books.addFirst'));
  });

  it('points at "Aggiungi" in the header when the library has books', async () => {
    show({ books: [book(1)] });
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    // The path may have been started with books already there (e.g. from another device's flow).
    act(() => state().start(firstBook));
    await waitFor(() => lampOn('books.add'));
  });

  it('follows the dialog: ISBN field, then "Salva"; saving completes the step and takes the celebration\'s place', async () => {
    show();
    const add = await screen.findByRole('button', { name: 'Aggiungi il primo libro' });
    await waitFor(() => lampOn('books.addFirst'));
    await userEvent.click(add);
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo libro' });
    await waitFor(() => lampOn('book.isbn'));
    // The card lives inside the dialog, where it can be used.
    expect(within(dialog).getByRole('region')).toHaveTextContent('sopra il codice a barre');
    expect(within(dialog).getByRole('region')).toHaveTextContent('Inserisci a mano');
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await waitFor(() => lampOn('book.save'));
    expect(within(dialog).getByRole('region')).toHaveTextContent('Controlla i dati e salva');
    await userEvent.type(screen.getByRole('textbox', { name: 'Titolo' }), 'Dune');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(state().status).toBe('done'));
    expect(await screen.findByRole('region', { name: 'Il tuo primo libro' })).toHaveTextContent('Dune è il primo libro della tua libreria.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(spotAt()).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    expect(screen.queryByRole('region', { name: 'Il tuo primo libro' })).not.toBeInTheDocument();
  });

  it('without the tour the celebration of the first book opens', async () => {
    localStorage.clear();
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi il primo libro' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Titolo' }), 'Dune');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('dialog', { name: /primo libro/i })).toBeInTheDocument();
  });
});
