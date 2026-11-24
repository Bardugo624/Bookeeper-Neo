import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, createFetchTransport, type RawRequest, type RawResponse, type Transport } from './index';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const raw = (status: number, bytes: Uint8Array = new Uint8Array(), headers: Record<string, string> = {}): RawResponse => ({
  status,
  bytes,
  contentType: null,
  headers,
});

function mk(res: RawResponse = raw(200, enc({}))) {
  const rawCalls: RawRequest[] = [];
  const calls: unknown[][] = [];
  const t: Transport = {
    request: async (...a) => {
      calls.push(a);
      return { status: 200, body: {} };
    },
    requestRaw: async (r) => {
      rawCalls.push(r);
      return res;
    },
  };
  return { t, rawCalls, calls, c: createClient(t) };
}

describe('files client', () => {
  it('lookupIsbn builds the path with fresh', async () => {
    const { c, calls } = mk();
    await c.lookupIsbn('978-0-306-40615-7', { fresh: true });
    expect(calls[0].slice(0, 2)).toEqual(['GET', '/api/v1/lookup/isbn/978-0-306-40615-7?fresh=true']);
    await c.lookupIsbn('9780306406157');
    expect(calls[1][1]).toBe('/api/v1/lookup/isbn/9780306406157');
  });
  it('getCover returns null on 304 and sends If-None-Match', async () => {
    const { c, rawCalls } = mk(raw(304));
    expect(await c.getCover('b1', { ifNoneMatch: '"x"' })).toBeNull();
    expect(rawCalls[0]).toMatchObject({ method: 'GET', path: '/api/v1/books/b1/cover', headers: { 'if-none-match': '"x"' } });
    const ok = mk(raw(200, new Uint8Array([1, 2]), { etag: '"e"' }));
    expect(await ok.c.getCover('b1')).toEqual({ bytes: new Uint8Array([1, 2]), etag: '"e"' });
  });
  it('uploadCover sends bytes untouched', async () => {
    const { c, rawCalls } = mk(raw(200, enc({ cover_color: '#000000' })));
    const bytes = new Uint8Array([9, 8, 7]);
    expect(await c.uploadCover('b1', bytes)).toEqual({ cover_color: '#000000' });
    expect(rawCalls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/books/b1/cover', contentType: 'application/octet-stream' });
    expect(rawCalls[0].body).toBe(bytes);
  });
  it('fetchCover and deleteCover', async () => {
    const { c, rawCalls, calls } = mk(raw(200, enc({ cover_color: '#fff', source_url: 'u' })));
    await c.fetchCover('b1', ['https://a/b.jpg']);
    expect(rawCalls[0]).toMatchObject({ method: 'POST', path: '/api/v1/books/b1/cover/fetch' });
    expect(JSON.parse(new TextDecoder().decode(rawCalls[0].body))).toEqual({ candidates: ['https://a/b.jpg'] });
    await c.deleteCover('b1');
    expect(calls[0].slice(0, 2)).toEqual(['DELETE', '/api/v1/books/b1/cover']);
  });
  it('importBooks posts JSON', async () => {
    const { c, rawCalls } = mk(raw(200, enc({ total: 1 })));
    await c.importBooks({ format: 'auto', content: 'x', dry_run: true });
    expect(rawCalls[0]).toMatchObject({ method: 'POST', path: '/api/v1/import', contentType: 'application/json' });
    expect(JSON.parse(new TextDecoder().decode(rawCalls[0].body))).toEqual({ format: 'auto', content: 'x', dry_run: true });
  });
  it('exportLibrary reads filename from Content-Disposition', async () => {
    const { c, rawCalls } = mk(raw(200, new Uint8Array([1]), { 'content-disposition': 'attachment; filename="bookeeper-casa-20261124.csv"' }));
    const r = await c.exportLibrary('csv');
    expect(rawCalls[0]).toMatchObject({ method: 'GET', path: '/api/v1/export?format=csv' });
    expect(r.filename).toBe('bookeeper-casa-20261124.csv');
    expect((await mk(raw(200)).c.exportLibrary('json')).filename).toBe('bookeeper-export.json');
  });
  it('confirm, list and config use JSON requests', async () => {
    const { c, calls } = mk();
    await c.confirm('pw');
    await c.confirm();
    await c.listBackups();
    await c.getBackupConfig();
    await c.setBackupConfig({ interval_days: 7, keep: 3 });
    expect(calls).toEqual([
      ['POST', '/api/v1/auth/confirm', { password: 'pw' }],
      ['POST', '/api/v1/auth/confirm', {}],
      ['GET', '/api/v1/backups'],
      ['GET', '/api/v1/backups/config'],
      ['PUT', '/api/v1/backups/config', { interval_days: 7, keep: 3 }],
    ]);
  });
  it('createBackup returns bytes and filename', async () => {
    const { c, rawCalls } = mk(raw(200, new Uint8Array([5]), { 'content-disposition': 'attachment; filename=b.zip' }));
    expect(await c.createBackup()).toEqual({ bytes: new Uint8Array([5]), filename: 'b.zip' });
    expect(rawCalls[0]).toMatchObject({ method: 'POST', path: '/api/v1/backup' });
  });
  it('restoreBackup sends X-Confirm-Token', async () => {
    const { c, rawCalls } = mk(raw(200, enc({ books: 1 })));
    const bytes = new Uint8Array([1]);
    await c.restoreBackup(bytes, 'tok');
    expect(rawCalls[0]).toMatchObject({ method: 'POST', path: '/api/v1/restore', headers: { 'X-Confirm-Token': 'tok' } });
    expect(rawCalls[0].body).toBe(bytes);
  });
  it('maps an error body of a binary request to ApiError', async () => {
    const { c } = mk(raw(400, enc({ error_code: 'invalid_archive', message: 'bad' })));
    await expect(c.restoreBackup(new Uint8Array(), 't')).rejects.toMatchObject({ status: 400, code: 'invalid_archive' });
    const rl = mk(raw(429, enc({ error_code: 'rate_limited', message: 'slow' }), { 'retry-after': '7' }));
    await expect(rl.c.createBackup()).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 7 });
  });
  it('labelsPdf reads skipped', async () => {
    const { c, rawCalls } = mk(raw(200, new Uint8Array([1]), { 'x-labels-skipped': '3' }));
    expect((await c.labelsPdf(['a'])).skipped).toBe(3);
    expect(rawCalls[0]).toMatchObject({ method: 'POST', path: '/api/v1/labels/pdf' });
    expect((await mk(raw(200)).c.labelsPdf(['a'])).skipped).toBe(0);
  });
  it('throws raw_unsupported without requestRaw', async () => {
    const c = createClient({ request: async () => ({ status: 200, body: {} }) });
    const p = c.getCover('b1');
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ code: 'raw_unsupported', status: 0 });
  });
});

describe('fetch transport requestRaw', () => {
  it('adds Authorization and lowercases headers', async () => {
    const f = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { ETag: '"e"', 'Content-Disposition': 'attachment; filename="a.zip"', 'Content-Type': 'application/zip' },
        }),
    );
    const t = createFetchTransport('https://h.example/', f as unknown as typeof fetch, { getAccessToken: () => 'tok' });
    const r = await t.requestRaw!({ method: 'PUT', path: '/p', body: new Uint8Array([4]), contentType: 'application/zip', headers: { 'X-Confirm-Token': 'c' } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'application/zip', 'x-confirm-token': 'c' });
    expect(r.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(r.contentType).toBe('application/zip');
    expect(r.headers).toEqual({ etag: '"e"', 'content-disposition': 'attachment; filename="a.zip"' });
  });
  it('maps network failure', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('down');
    });
    const t = createFetchTransport('https://h.example', f as unknown as typeof fetch);
    await expect(t.requestRaw!({ method: 'GET', path: '/p' })).rejects.toMatchObject({ code: 'network', status: 0 });
  });
  it('request forwards extra headers', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await createFetchTransport('https://h.example', f as unknown as typeof fetch).request('POST', '/p', undefined, { 'X-Confirm-Token': 'c' });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ 'x-confirm-token': 'c' });
  });
});
