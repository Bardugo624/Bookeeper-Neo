import { describe, expect, it, vi } from 'vitest';
import { createFetchTransport } from './index';

const mk = (headers: Record<string, string> = {}) => {
  const f = vi.fn(async (_u: unknown, _i?: RequestInit) => new Response('{}', { status: 200, headers }));
  return f;
};
const auth = (f: ReturnType<typeof mk>) => new Headers(f.mock.calls[0]![1]!.headers).get('authorization');

describe('fetch transport auth', () => {
  it('sends the bearer token', async () => {
    const f = mk();
    await createFetchTransport('http://x', f as unknown as typeof fetch, { getAccessToken: () => 'tok' }).request('GET', '/a');
    expect(auth(f)).toBe('Bearer tok');
  });
  it('supports an async token getter', async () => {
    const f = mk();
    await createFetchTransport('http://x', f as unknown as typeof fetch, { getAccessToken: async () => 'tok' }).request('POST', '/a', {});
    expect(auth(f)).toBe('Bearer tok');
  });
  it('omits Authorization for null', async () => {
    const f = mk();
    await createFetchTransport('http://x', f as unknown as typeof fetch, { getAccessToken: () => null }).request('GET', '/a');
    expect(auth(f)).toBeNull();
  });
  it('omits Authorization without options', async () => {
    const f = mk();
    await createFetchTransport('http://x', f as unknown as typeof fetch).request('GET', '/a');
    expect(auth(f)).toBeNull();
  });
  it('parses Retry-After', async () => {
    const f = mk({ 'retry-after': '30' });
    const r = await createFetchTransport('http://x', f as unknown as typeof fetch).request('GET', '/a');
    expect(r.retryAfter).toBe(30);
  });
  it('gives undefined for a non-numeric Retry-After', async () => {
    const f = mk({ 'retry-after': 'soon' });
    const r = await createFetchTransport('http://x', f as unknown as typeof fetch).request('GET', '/a');
    expect(r.retryAfter).toBeUndefined();
  });
});
