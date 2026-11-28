import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { book, installIntersectionObserver, renderBooks } from './testkit';

let width = 1280;

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        void cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detail layout', () => {
  it.each([
    [1280, 'false'],
    [920, 'false'],
    [919, 'true'],
    [720, 'true'],
  ])('at a content width of %i the right column stacked is %s', async (w, stacked) => {
    width = w;
    renderBooks({ books: [book(1, { title: 'Il nome della rosa' })] }, '/books/b1');
    const title = await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' });
    const layout = title.closest('article')!;
    expect(layout).toHaveAttribute('data-stacked', stacked);
  });
});
