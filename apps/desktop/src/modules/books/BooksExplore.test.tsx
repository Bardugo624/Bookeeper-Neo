import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/testing';
import { explore } from '../tour/explore';
import { module as tour } from '../tour/routes';
import { isTourPending } from '../tour/storage';
import { resetTourForTest, tourSignal, useTourStore } from '../tour/store';
import { book, booksPlatform, installIntersectionObserver, type Library } from './testkit';
import { module as books } from './routes';

// Each anchor gets its own x, so the lamp's position says which anchor it is on.
const X: Record<string, number> = { 'nav.search': 10, 'book.where': 20, 'book.reading': 30 };
const state = () => useTourStore.getState();
const lampOn = (id: string) =>
  expect((document.querySelector('[data-tour-spotlight] > div') as HTMLElement | null)?.style.transform).toBe(`translate(${X[id]! - 8}px, 92px)`);

function show(lib: Partial<Library> = {}, route = '/books') {
  const put = (r: { method: string; path: string }) =>
    r.method === 'PUT' && r.path.endsWith('/reading')
      ? { status: 200, body: { book_id: 'b1', status: 'reading', started_at: 1, finished_at: null, rating: null, note: null, current_page: null, updated_at: 1 } }
      : undefined;
  const platform = booksPlatform({ extra: put, books: [book(1, { placement: { shelf_id: 's1', row_index: 0, slot_index: 0 } })], ...lib });
  return renderApp({ platform, modules: [books, tour], route });
}

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
  localStorage.setItem('bookeeper.tour.pending.c1', '1');
  installIntersectionObserver();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-tour');
    const x = id ? (X[id] ?? 5) : 0;
    return { x, y: 100, left: x, top: 100, width: id ? 80 : 0, height: id ? 32 : 0, right: x + 80, bottom: 132, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('explore', () => {
  it('has at most three steps, each with its own signal', () => {
    expect(explore.steps.map((s) => s.signal)).toEqual(['book-opened', 'where-shown', 'reading-changed']);
  });

  it('starts for a guest and drops the mark', async () => {
    show({ role: 'guest' });
    await waitFor(() => expect(state().pathId).toBe('explore'));
    expect(state().status).toBe('running');
    expect(isTourPending('c1')).toBe(false);
  });

  it('lights the search, and opening a book from the list completes the step', async () => {
    show();
    await waitFor(() => expect(state().pathId).toBe('explore'));
    await userEvent.click(await screen.findByRole('link', { name: 'Libro 1 Autore 1' }));
    await screen.findByRole('heading', { level: 1, name: 'Libro 1' });
    await waitFor(() => expect(state().step).toBe(1));
    expect(state().status).toBe('running');
  });

  it('on the book page lights «Dove si trova», then the reading block, then a change of reading ends it', async () => {
    show();
    await userEvent.click(await screen.findByRole('link', { name: 'Libro 1 Autore 1' }));
    await screen.findByRole('heading', { level: 1, name: 'Libro 1' });
    await waitFor(() => lampOn('book.where'));
    expect(state().status).toBe('running');
    act(() => tourSignal('where-shown'));
    await waitFor(() => lampOn('book.reading'));
    await userEvent.click(await screen.findByRole('button', { name: 'Inizia a leggere' }));
    await waitFor(() => expect(state().status).toBe('done'));
  });

  it('away from the book page the light goes back to the search', async () => {
    show();
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    act(() => state().start(explore));
    act(() => tourSignal('book-opened'));
    await waitFor(() => lampOn('nav.search'));
  });
});
