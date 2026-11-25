import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  updateBook: vi.fn(),
  getBook: vi.fn(),
  deleteCover: vi.fn(),
  fetchCover: vi.fn(),
  uploadCover: vi.fn(),
};
vi.mock('../../session', () => ({
  useClient: () => client,
  useSession: (select: (s: { connection: { id: string } }) => unknown) => select({ connection: { id: 'c1' } }),
}));

import { useBookWrites } from './useBookWrites';

const saved = { id: 'b1', title: 'Dune' };
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.resetAllMocks();
  queryClient = new QueryClient();
  client.updateBook.mockResolvedValue(saved);
  client.getBook.mockResolvedValue(saved);
  client.deleteCover.mockResolvedValue(undefined);
});

describe('update', () => {
  it('does not touch the cover when the PATCH fails', async () => {
    client.updateBook.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    await act(async () => {
      await expect(
        result.current.update.mutateAsync({ id: 'b1', patch: { title: 'X' }, cover: { kind: 'remove' }, hadCover: true }),
      ).rejects.toThrow('boom');
    });
    expect(client.deleteCover).not.toHaveBeenCalled();
  });

  it('patches the fields before the cover operation', async () => {
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    await act(async () => {
      await result.current.update.mutateAsync({ id: 'b1', patch: { title: 'X' }, cover: { kind: 'remove' }, hadCover: true });
    });
    expect(client.updateBook.mock.invocationCallOrder[0]).toBeLessThan(client.deleteCover.mock.invocationCallOrder[0]!);
  });

  it('writes a color chosen with the removal again after the delete', async () => {
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    await act(async () => {
      await result.current.update.mutateAsync({ id: 'b1', patch: { cover_color: '#112233' }, cover: { kind: 'remove' }, hadCover: true });
    });
    expect(client.updateBook).toHaveBeenCalledTimes(2);
    expect(client.updateBook).toHaveBeenLastCalledWith('b1', { cover_color: '#112233' });
  });

  it('reports a failed cover as partial and still refreshes the queries', async () => {
    client.deleteCover.mockRejectedValue(new Error('no'));
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    let out: Awaited<ReturnType<typeof result.current.update.mutateAsync>> | undefined;
    await act(async () => {
      out = await result.current.update.mutateAsync({ id: 'b1', patch: { title: 'X' }, cover: { kind: 'remove' }, hadCover: true });
    });
    expect(out?.coverFailed).toBe(true);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['books', 'c1'] });
  });

  it('refreshes the queries even when the PATCH fails', async () => {
    client.updateBook.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    await act(async () => {
      await result.current.update.mutateAsync({ id: 'b1', patch: { title: 'X' }, cover: { kind: 'keep' }, hadCover: false }).catch(() => {});
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['books', 'c1'] });
  });

  it('reports a failed second color save as colorFailed, not coverFailed', async () => {
    client.updateBook.mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('500'));
    const { result } = renderHook(() => useBookWrites(), { wrapper });
    let out: Awaited<ReturnType<typeof result.current.update.mutateAsync>> | undefined;
    await act(async () => {
      out = await result.current.update.mutateAsync({ id: 'b1', patch: { cover_color: '#112233' }, cover: { kind: 'remove' }, hadCover: true });
    });
    expect(out?.coverFailed).toBe(false);
    expect(out?.colorFailed).toBe(true);
  });
});
