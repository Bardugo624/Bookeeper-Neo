import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { explore } from '../tour/explore';
import { firstBook } from '../tour/firstBook';
import { module as tour } from '../tour/routes';
import { resetTourForTest, tourSignal, useTourStore } from '../tour/store';
import { dropOnRow } from './dnd';
import { module } from './routes';
import { book, shelf, shelvesPlatform, type World } from './testkit';

const elsewhere: AppModule = { id: 'books', nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 }, routes: [{ path: '/books', element: <h1>Libri</h1> }] };
// Each anchor gets its own x, so the lamp's position says which anchor it is on.
const X: Record<string, number> = { 'nav.shelves': 10, 'shelves.new': 20, 'shelf.form': 30, 'shelves.unplaced': 40, 'place.confirm': 50 };

const state = () => useTourStore.getState();
const lampOn = (id: string) => expect((document.querySelector('[data-tour-spotlight] > div') as HTMLElement | null)?.style.transform).toBe(`translate(${X[id]! - 8}px, 92px)`);

function world(over: Partial<World> = {}): World {
  return { shelves: [], books: [book('u1')], spots: {}, ...over };
}

function show(w: World, route = '/shelves') {
  const platform = shelvesPlatform(w);
  renderApp({ platform, modules: [module, elsewhere, tour], route });
  return platform;
}

/** The tour at step 2: the first book is in. */
function atPlace() {
  act(() => state().start(firstBook));
  act(() => tourSignal('book-created'));
}

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-tour');
    const x = id ? (X[id] ?? 5) : 0;
    const on = id && id !== 'shelves.page';
    return { x, y: 100, left: x, top: 100, width: on ? 80 : 0, height: on ? 32 : 0, right: x + 80, bottom: 132, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('«Dagli un posto»', () => {
  it('goes from the sidebar to «Nuovo mobile», then to the book, and book-placed ends the path', async () => {
    const w = world();
    show(w, '/books');
    await screen.findByRole('heading', { name: 'Libri' });
    atPlace();
    await waitFor(() => lampOn('nav.shelves'));

    await userEvent.click(screen.getByRole('link', { name: 'Scaffali' }));
    await screen.findByRole('button', { name: 'Nuovo mobile' });
    await waitFor(() => lampOn('shelves.new'));
    expect(screen.getByText('Crea il mobile dove tieni i libri: un nome e quanti ripiani.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await waitFor(() => lampOn('shelf.form'));
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));

    await screen.findByText('Libro u1');
    expect(state().seen).toContain('shelf-created');
    expect(state().step).toBe(1);
    await waitFor(() => lampOn('shelves.unplaced'));
    expect(screen.getByText('Trascina il libro su un ripiano, oppure usa «Colloca».')).toBeInTheDocument();

    await screen.findByRole('group', { name: 'Ripiano 1' });
    dropOnRow('u1', 'Ripiano 1', 20);
    await waitFor(() => expect(state().status).toBe('done'));
    expect(await screen.findByRole('region', { name: 'La tua libreria è pronta' })).toBeInTheDocument();
  });

  it('does not pause when «Crea il primo mobile» is pressed in the empty state', async () => {
    show(world());
    await screen.findByRole('button', { name: 'Crea il primo mobile' });
    atPlace();
    await waitFor(() => lampOn('shelves.new'));
    await userEvent.click(screen.getByRole('button', { name: 'Crea il primo mobile' }));
    await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    expect(state().status).toBe('running');
  });

  it('skips the mobile when one already exists', async () => {
    show(world({ shelves: [shelf(1)] }));
    await screen.findByText('Libro u1');
    atPlace();
    await waitFor(() => lampOn('shelves.unplaced'));
  });

  it('completes with «Colloca», lighting the dialog\'s button meanwhile', async () => {
    const w = world({ shelves: [shelf(1)] });
    show(w);
    const open = await screen.findByRole('button', { name: 'Colloca «Libro u1» in…' });
    atPlace();
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => lampOn('place.confirm'));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Colloca' })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Colloca' }));
    await waitFor(() => expect(state().status).toBe('done'));
  });

  it('does not signal a failed placement or a failed mobile', async () => {
    const w = world({ shelves: [shelf(1)], placeFails: 500 });
    show(w);
    await screen.findByText('Libro u1');
    atPlace();
    await screen.findByRole('group', { name: 'Ripiano 1' });
    dropOnRow('u1', 'Ripiano 1', 20);
    await screen.findByText('Non è stato possibile spostare il libro');
    expect(state().status).toBe('running');
    expect(state().step).toBe(1);
  });

  it('does not signal a mobile that could not be saved', async () => {
    const w = world({ refuse: { method: 'POST', status: 500, code: 'internal' } });
    show(w);
    await screen.findByRole('button', { name: 'Nuovo mobile' });
    atPlace();
    await userEvent.click(screen.getByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await within(dialog).findByRole('alert');
    expect(state().seen).not.toContain('shelf-created');
  });
});

describe('«Dove si trova»', () => {
  const stepTwo = async () => {
    await waitFor(() => expect(state().connectionId).toBe('c1'));
    act(() => state().start(explore));
    act(() => tourSignal('book-opened'));
  };

  it('where-shown comes when the shelves show the placed book', async () => {
    show(world({ shelves: [shelf(1)], books: [book('u1')], spots: { u1: { shelf: 's1', row: 0, slot: 0 } } }), '/shelves?unit=s1&book=u1');
    await stepTwo();
    await waitFor(() => expect(state().step).toBe(2));
  });

  it('an unplaced book is told so and the step is done all the same', async () => {
    show(world({ shelves: [shelf(1)], books: [book('u1')], spots: {} }), '/shelves?unit=s1&book=u1');
    await stepTwo();
    await waitFor(() => expect(state().step).toBe(2));
  });
});
