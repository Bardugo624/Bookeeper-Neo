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

it('requestRaw sends base64 and decodes the response bytes', async () => {
  invoke.mockResolvedValueOnce({ status: 200, body_base64: 'AP+A', content_type: 'application/pdf', headers: { etag: '"x"' } });
  const r = await createTauriTransport().requestRaw!({
    method: 'POST',
    path: '/api/v1/f',
    body: new Uint8Array([0, 255, 128]),
    contentType: 'application/octet-stream',
  });
  expect(invoke).toHaveBeenLastCalledWith(
    'api_request_raw',
    expect.objectContaining({ method: 'POST', path: '/api/v1/f', body_base64: 'AP+A', content_type: 'application/octet-stream' }),
  );
  expect(r.bytes).toEqual(new Uint8Array([0, 255, 128]));
  expect(r.contentType).toBe('application/pdf');
  expect(r.headers).toEqual({ etag: '"x"' });
});

it('requestRaw handles a 2 MB body', async () => {
  const big = new Uint8Array(2 * 1024 * 1024);
  for (let i = 0; i < big.length; i++) big[i] = i % 256;
  invoke.mockImplementationOnce(async (_c: string, a: { body_base64: string }) => ({
    status: 200,
    body_base64: a.body_base64,
    content_type: null,
    headers: {},
  }));
  const r = await createTauriTransport().requestRaw!({ method: 'PUT', path: '/api/v1/f', body: big });
  expect(r.bytes.length).toBe(big.length);
  expect(Buffer.from(r.bytes).equals(Buffer.from(big))).toBe(true);
});

it('requestRaw sends body_base64 null without a body', async () => {
  invoke.mockResolvedValueOnce({ status: 200, body_base64: '', content_type: null, headers: {} });
  await createTauriTransport().requestRaw!({ method: 'GET', path: '/api/v1/f' });
  expect(invoke).toHaveBeenLastCalledWith('api_request_raw', expect.objectContaining({ body_base64: null }));
});

it('requestRaw maps a failed invoke to ApiError "network"', async () => {
  invoke.mockRejectedValueOnce('ipc closed');
  await expect(createTauriTransport().requestRaw!({ method: 'GET', path: '/api/v1/f' })).rejects.toMatchObject({
    status: 0,
    code: 'network',
  });
});
