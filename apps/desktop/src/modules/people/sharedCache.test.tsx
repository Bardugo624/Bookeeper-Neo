import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { person } from './testkit';

const listUsers = vi.fn(async () => ({ items: [person('u2', 'Bruno', 'member')] }));
const listBorrowers = vi.fn(async () => ({ items: [] as string[] }));
vi.mock('../../session', () => ({
  useClient: () => ({ listUsers, listBorrowers, me: vi.fn() }),
  useSession: Object.assign((sel: (s: unknown) => unknown) => sel({ connection: { id: 'c1' }, signOut: vi.fn() }), {
    getState: () => ({ me: null }),
    setState: vi.fn(),
  }),
}));

import { usePeople as useBookPeople } from '../books/usePeople';
import { useBorrowerSuggestions } from '../loans/useBorrowerSuggestions';
import { usePeople } from './usePeople';

function shared() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return wrapper;
}

describe('people list cache', () => {
  it('keeps the array for the People page after the book hook has read it', async () => {
    const wrapper = shared();
    const books = renderHook(() => useBookPeople(), { wrapper });
    await waitFor(() => expect(books.result.current).toHaveLength(1));
    const page = renderHook(() => usePeople(), { wrapper });
    await waitFor(() => expect(page.result.current.query.data).toEqual([expect.objectContaining({ id: 'u2' })]));
    expect(page.result.current.query.isError).toBe(false);
  });

  it('keeps the array for the People page after the loan suggestions have read it', async () => {
    const wrapper = shared();
    const sugg = renderHook(() => useBorrowerSuggestions('', true, 'Tu'), { wrapper });
    await waitFor(() => expect(sugg.result.current.people).toHaveLength(1));
    const page = renderHook(() => usePeople(), { wrapper });
    await waitFor(() => expect(page.result.current.query.data).toHaveLength(1));
    expect(page.result.current.query.isError).toBe(false);
  });
});
