import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { intParam, oneOfParam, stringParam, useListParams } from './useListParams';

const schema = {
  q: stringParam(''),
  filter: oneOfParam(['all', 'loan'] as const, 'all'),
  page: intParam(1, 1),
};

function setup(url: string) {
  let location!: ReturnType<typeof useLocation>;
  // The hook must live inside the router: render it through a route element.
  let hook!: ReturnType<typeof useListParams<{ q: string; filter: 'all' | 'loan'; page: number }>>;
  function HookRoute() {
    hook = useListParams(schema);
    location = useLocation();
    return null;
  }
  const r = createMemoryRouter([{ path: '*', element: <HookRoute /> }], { initialEntries: [url] });
  return { router: r, get: () => hook, loc: () => location };
}

function mount(url: string) {
  const s = setup(url);
  render(<RouterProvider router={s.router} />);
  return s;
}

describe('useListParams', () => {
  it('uses defaults and keeps them out of the address', () => {
    const s = mount('/books');
    expect(s.get().values).toEqual({ q: '', filter: 'all', page: 1 });
    act(() => s.get().set({ q: 'dune', filter: 'loan' }));
    expect(s.loc().search).toBe('?q=dune&filter=loan');
    act(() => s.get().set({ filter: 'all' }));
    expect(s.loc().search).toBe('?q=dune');
  });

  it('accumulates two set calls in the same handler', () => {
    const s = mount('/books');
    act(() => {
      s.get().set({ q: 'dune' });
      s.get().set({ page: 2 });
    });
    expect(s.loc().search).toBe('?q=dune&page=2');
  });

  it('falls back to the default on invalid values', () => {
    const s = mount('/books?filter=zzz&page=-4');
    expect(s.get().values).toEqual({ q: '', filter: 'all', page: 1 });
  });

  it('replaces the history entry', () => {
    const s = mount('/books');
    act(() => s.get().set({ q: 'a' }));
    act(() => s.get().set({ q: 'ab' }));
    expect(s.router.state.historyAction).toBe('REPLACE');
    expect(s.router.state.location.search).toBe('?q=ab');
  });

  it('resets to defaults', () => {
    const s = mount('/books?q=x&page=3');
    expect(s.get().values.page).toBe(3);
    act(() => s.get().reset());
    expect(s.loc().search).toBe('');
  });
});
