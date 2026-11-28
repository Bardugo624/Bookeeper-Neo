import { renderHook, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSearch } from './useSearch';

function setup() {
  const engine = {
    search: vi.fn((q: string) => (q ? new Promise<void>(() => undefined) : Promise.resolve())),
    stopSearch: vi.fn(),
  };
  const view = renderHook(({ open }) => useSearch(engine as never, open), { initialProps: { open: true } });
  act(() => view.result.current.setQuery('lento'));
  engine.search.mockClear();
  return { engine, view };
}

it('closing_search_clears_the_marks', () => {
  const { engine, view } = setup();
  expect(engine.search).toHaveBeenCalledTimes(0);
  view.rerender({ open: false });
  expect(view.result.current.query).toBe('');
  expect(engine.search).toHaveBeenCalledWith('', expect.anything(), expect.anything());
});

it('clearing_the_query_clears_the_marks', () => {
  const { engine, view } = setup();
  act(() => view.result.current.clear());
  expect(engine.search).toHaveBeenCalledWith('', expect.anything(), expect.anything());
});

it('on_the_phone_a_chosen_result_keeps_its_marks_until_the_next_page', () => {
  const { engine, view } = setup();
  act(() => view.result.current.keepMarks());
  view.rerender({ open: false });
  expect(view.result.current.query).toBe('lento');
  expect(engine.search).not.toHaveBeenCalled();
  act(() => view.result.current.releaseMarks());
  expect(view.result.current.query).toBe('');
  expect(engine.search).toHaveBeenCalledWith('', expect.anything(), expect.anything());
});

it('on_the_phone_reopening_the_search_ends_the_hold', () => {
  const { engine, view } = setup();
  act(() => view.result.current.keepMarks());
  view.rerender({ open: false });
  view.rerender({ open: true });
  view.rerender({ open: false });
  expect(view.result.current.query).toBe('');
  expect(engine.search).toHaveBeenCalledWith('', expect.anything(), expect.anything());
});

it('on_the_phone_opening_another_tab_ends_the_hold', () => {
  const engine = {
    search: vi.fn((q: string) => (q ? new Promise<void>(() => undefined) : Promise.resolve())),
    stopSearch: vi.fn(),
  };
  const view = renderHook(({ open, panel }) => useSearch(engine as never, open, panel), {
    initialProps: { open: true, panel: true },
  });
  act(() => view.result.current.setQuery('lento'));
  engine.search.mockClear();
  act(() => view.result.current.keepMarks());
  view.rerender({ open: false, panel: false });
  expect(view.result.current.query).toBe('lento');
  // The sheet opens on Indice (or Note): the search tab is not open, but the hold ends.
  view.rerender({ open: false, panel: true });
  expect(view.result.current.query).toBe('');
  expect(engine.search).toHaveBeenCalledWith('', expect.anything(), expect.anything());
});
