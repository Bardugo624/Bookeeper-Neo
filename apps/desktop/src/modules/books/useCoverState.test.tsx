import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@bookeeper/api';

const client = { getCover: vi.fn() };
vi.mock('../../session', () => ({
  useClient: () => client,
  useSession: (select: (s: { connection: { id: string } }) => unknown) => select({ connection: { id: 'c1' } }),
}));

import { useCoverState } from './useCover';

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.resetAllMocks();
  queryClient = new QueryClient();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('useCoverState', () => {
  it('is "none" when no request is made', () => {
    const { result } = renderHook(() => useCoverState('b1', false), { wrapper });
    expect(result.current.status).toBe('none');
  });

  it('is "loading" and then "absent" on a 404', async () => {
    client.getCover.mockRejectedValue(new ApiError(404, 'not_found', 'x'));
    const { result } = renderHook(() => useCoverState('b1', true), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('absent'));
  });

  it('is "failed" on a network or 5xx error', async () => {
    client.getCover.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useCoverState('b1', true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });

  it('is "ready" with a URL when the cover arrives', async () => {
    client.getCover.mockResolvedValue({ bytes: new Uint8Array([1]), etag: null });
    const { result } = renderHook(() => useCoverState('b1', true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.src).toBe('blob:x');
  });
});
