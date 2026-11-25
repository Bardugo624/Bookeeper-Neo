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

describe('client routes', () => {
  const rec = (status = 200, body: unknown = {}) => {
    const calls: Array<[string, string, unknown]> = [];
    const t: Transport = {
      request: async (m, p, b) => {
        calls.push([m, p, b]);
        return { status, body };
      },
    };
    return { calls, c: createClient(t) };
  };
  const dev = { device_name: 'd', device_kind: 'desktop' as const };

  it('uses the contract method, path and body', async () => {
    const { calls, c } = rec();
    await c.setupStatus();
    await c.setup({ library_name: 'l', display_name: 'n', ...dev });
    await c.login({ email: 'e', password: 'p', ...dev });
    await c.libraries({ email: 'e', password: 'p' });
    await c.refresh('r');
    await c.me();
    await c.createPairingCode();
    await c.redeemPairingCode({ code: 'c', ...dev });
    await c.listDevices();
    await c.renameDevice('i', 'x');
    expect(calls).toEqual([
      ['GET', '/api/v1/setup', undefined],
      ['POST', '/api/v1/setup', { library_name: 'l', display_name: 'n', ...dev }],
      ['POST', '/api/v1/auth/login', { email: 'e', password: 'p', ...dev }],
      ['POST', '/api/v1/auth/libraries', { email: 'e', password: 'p' }],
      ['POST', '/api/v1/auth/refresh', { refresh_token: 'r' }],
      ['GET', '/api/v1/me', undefined],
      ['POST', '/api/v1/pairing/codes', undefined],
      ['POST', '/api/v1/pairing/redeem', { code: 'c', ...dev }],
      ['GET', '/api/v1/devices', undefined],
      ['PATCH', '/api/v1/devices/i', { name: 'x' }],
    ]);
  });
  it('resolves undefined on 204 and uses contract paths', async () => {
    const { calls, c } = rec(204, null);
    await expect(c.logout()).resolves.toBeUndefined();
    await expect(c.setPassword({ new_password: 'abcdefgh' })).resolves.toBeUndefined();
    await expect(c.revokeDevice('i')).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['POST', '/api/v1/auth/logout', undefined],
      ['POST', '/api/v1/auth/password', { new_password: 'abcdefgh' }],
      ['POST', '/api/v1/devices/i/revoke', undefined],
    ]);
  });
  it('sends the confirm token on revokeDevice only when given', async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const t: Transport = {
      request: async (_m, _p, _b, h) => {
        seen.push(h);
        return { status: 204, body: null };
      },
    };
    const c = createClient(t);
    await c.revokeDevice('i', 'tok');
    await c.revokeDevice('i');
    expect(seen[0]).toEqual({ 'X-Confirm-Token': 'tok' });
    expect(seen[1]).toBeUndefined();
  });
  it('encodes device ids', async () => {
    const { calls, c } = rec();
    await c.renameDevice('a/b', 'x');
    expect(calls[0]![1]).toBe('/api/v1/devices/a%2Fb');
  });
  it('maps token_expired', async () => {
    const { c } = rec(401, { error_code: 'token_expired', message: 'm' });
    await expect(c.me()).rejects.toMatchObject({ status: 401, code: 'token_expired' });
  });
  it('carries retryAfter on 429', async () => {
    const t: Transport = {
      request: async () => ({ status: 429, body: { error_code: 'rate_limited', message: 'm' }, retryAfter: 30 }),
    };
    const p = createClient(t).login({ email: 'e', password: 'p', ...dev });
    await expect(p).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
    await expect(p).rejects.toBeInstanceOf(ApiError);
  });
});
