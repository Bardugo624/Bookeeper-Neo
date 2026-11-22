import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, createFetchTransport, type Transport } from './index';

const fake = (status: number, body: unknown): Transport => ({ request: async () => ({ status, body }) });

describe('client', () => {
  it('returns health on 200', async () => {
    const h = await createClient(fake(200, { status: 'ok', version: '2.0.0-dev', time: 't' })).health();
    expect(h.version).toBe('2.0.0-dev');
  });
  it('throws ApiError carrying error_code', async () => {
    const p = createClient(fake(404, { error_code: 'not_found', message: 'x' })).health();
    await expect(p).rejects.toMatchObject({ status: 404, code: 'not_found' });
    await expect(p).rejects.toBeInstanceOf(ApiError);
  });
  it('maps a non-JSON error body to code "unknown"', async () => {
    await expect(createClient(fake(502, '<html>')).health()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('client on a non-JSON success', () => {
  it('rejects a 200 whose body is not an object', async () => {
    await expect(createClient(fake(200, '<html>')).health()).rejects.toMatchObject({ status: 200, code: 'unknown' });
  });
});

describe('fetch transport', () => {
  it('maps a body read failure to ApiError code "network"', async () => {
    const res = { status: 200, text: async () => { throw new TypeError('aborted'); } } as unknown as Response;
    const f = vi.fn(async () => res);
    await expect(createFetchTransport('https://h.example', f as unknown as typeof fetch).request('GET', '/api/v1/health'))
      .rejects.toMatchObject({ code: 'network', status: 0 });
  });
  it('joins base URL and path and sends JSON', async () => {
    const f = vi.fn(async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await createFetchTransport('https://h.example/', f as unknown as typeof fetch).request('POST', '/api/v1/x', { b: 2 });
    expect(f).toHaveBeenCalledWith('https://h.example/api/v1/x', expect.objectContaining({ method: 'POST', body: '{"b":2}' }));
    expect(r).toEqual({ status: 200, body: { a: 1 } });
  });
  it('maps a network failure to ApiError code "network"', async () => {
    const f = vi.fn(async () => { throw new TypeError('failed'); });
    await expect(createFetchTransport('https://h.example', f as unknown as typeof fetch).request('GET', '/api/v1/health'))
      .rejects.toMatchObject({ code: 'network', status: 0 });
  });
});
