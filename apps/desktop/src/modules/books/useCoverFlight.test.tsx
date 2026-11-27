import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookOut } from '@bookeeper/api';
import { book, installIntersectionObserver } from './testkit';
import { openNewBook, renderWithWrites } from './writeKit';

const DIALOG_COVER = { left: 300, top: 200, width: 96, height: 144 };
const CARD_COVER = { left: 20, top: 40, width: 144, height: 216 };
const box = (r: typeof CARD_COVER) =>
  ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} }) as DOMRect;

interface Flying {
  node: HTMLElement;
  keyframes: Array<Record<string, string>>;
  animation: { onfinish: (() => void) | null; oncancel: (() => void) | null; cancel: () => void };
}

let flying: Flying[];

function simulate({ reduced = false } = {}) {
  flying = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.closest('[data-book-cover]') || this.hasAttribute('data-book-cover')) return box(CARD_COVER);
    if (this.closest('[role="dialog"]')) return box(DIALOG_COVER);
    return box({ left: 0, top: 0, width: 0, height: 0 });
  });
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLElement.prototype.animate = vi.fn(function (this: HTMLElement, keyframes: Array<Record<string, string>>) {
    const animation = { onfinish: null, oncancel: null, cancel: vi.fn(), addEventListener() {} };
    // Only the copy of the cover is marked as a flight.
    if (this.dataset.coverFlight !== undefined) flying.push({ node: this, keyframes, animation });
    return animation;
  }) as never;
}

/** Creates "Dune": the fake list gains it, so its card shows up when the list refreshes. */
function renderCreate(books: BookOut[], route = '/books') {
  return renderWithWrites({ books }, {
    'POST /api/v1/books': (r) => {
      const created = book(99, { ...(r.body as object), id: 'new', title: 'Dune' });
      books.push(created);
      return { status: 201, body: created };
    },
  }, route);
}

async function fillAndSave(label: 'Salva' | 'Salva e aggiungi un altro') {
  await openNewBook();
  await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Titolo' }), 'Dune');
  await userEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the cover flies to its card', () => {
  it('moves from the dialog position to the card of the new book, and the copy goes at the end', async () => {
    simulate();
    renderCreate([book(1)]);
    await fillAndSave('Salva');
    await waitFor(() => expect(flying.length).toBe(1));
    const [flight] = flying;
    expect(flight!.keyframes[1]!.transform).toBe('translate(-280px, -160px) scale(1.5)');
    expect(flight!.node.style.position).toBe('fixed');
    expect(document.body.contains(flight!.node)).toBe(true);
    flight!.animation.onfinish!();
    expect(document.body.contains(flight!.node)).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-book-cover="new"]')!.style.visibility).toBe('');
  });

  it('flies nothing with "Salva e aggiungi un altro"', async () => {
    simulate();
    renderCreate([book(1)]);
    await fillAndSave('Salva e aggiungi un altro');
    await screen.findByRole('textbox', { name: 'ISBN' });
    await waitFor(() => expect(document.querySelector('[data-book-cover="new"]')).not.toBeNull());
    expect(flying).toHaveLength(0);
  });

  it('flies nothing with reduced motion', async () => {
    simulate({ reduced: true });
    renderCreate([book(1)]);
    await fillAndSave('Salva');
    await waitFor(() => expect(document.querySelector('[data-book-cover="new"]')).not.toBeNull());
    expect(flying).toHaveLength(0);
    expect(document.body.querySelectorAll('[data-cover-flight]')).toHaveLength(0);
  });

  it('fades away, without flying to the grid, when the card is not there (table view)', async () => {
    simulate();
    localStorage.setItem('bookeeper.books.view.c1', 'list');
    renderCreate([book(1)]);
    await fillAndSave('Salva');
    await waitFor(() => expect(flying.length).toBe(1));
    expect(flying[0]!.keyframes.map((k) => k.opacity)).toEqual([1, 0]);
    expect(flying[0]!.keyframes.some((k) => /scale/.test(k.transform ?? ''))).toBe(false);
    flying[0]!.animation.onfinish!();
    expect(document.body.contains(flying[0]!.node)).toBe(false);
  });

  it('takes the copy out of the document when the page unmounts mid-flight', async () => {
    simulate();
    const view = renderCreate([book(1)]);
    await fillAndSave('Salva');
    await waitFor(() => expect(flying.length).toBe(1));
    view.unmount();
    expect(document.body.contains(flying[0]!.node)).toBe(false);
    expect(flying[0]!.animation.cancel).toHaveBeenCalled();
  });
});
