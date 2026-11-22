import { expect, it, vi } from 'vitest';
import { ApiError } from '@bookeeper/api';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { createTauriTransport } = await import('./transport');

it('sends method, path and a JSON body to api_request', async () => {
  invoke.mockResolvedValueOnce({ status: 200, body: '{"a":1}' });
  const r = await createTauriTransport().request('POST', '/api/v1/x', { b: 2 });
  expect(invoke).toHaveBeenCalledWith('api_request', { method: 'POST', path: '/api/v1/x', body: '{"b":2}' });
  expect(r).toEqual({ status: 200, body: { a: 1 } });
});

it('sends null when there is no body', async () => {
  invoke.mockResolvedValueOnce({ status: 200, body: '' });
  const r = await createTauriTransport().request('GET', '/api/v1/health');
  expect(invoke).toHaveBeenLastCalledWith('api_request', { method: 'GET', path: '/api/v1/health', body: null });
  expect(r).toEqual({ status: 200, body: null });
});

it('maps a failed invoke to ApiError code "network"', async () => {
  invoke.mockRejectedValueOnce('ipc closed');
  const p = createTauriTransport().request('GET', '/api/v1/health');
  await expect(p).rejects.toBeInstanceOf(ApiError);
  await expect(p).rejects.toMatchObject({ status: 0, code: 'network' });
});
