import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConnection } from './testing';
import { browserPlatform } from './browser';

beforeEach(() => localStorage.clear());

it('connections survive a new instance', async () => {
  await browserPlatform('http://x').connections.upsert(fakeConnection());
  await browserPlatform('http://x').connections.activate('c1');
  const got = await browserPlatform('http://x').connections.get();
  expect(got.active).toBe('c1');
  expect(got.items).toHaveLength(1);
  const after = await browserPlatform('http://x').connections.remove('c1');
  expect(after).toEqual({ active: null, items: [] });
});

it('upsert replaces by id', async () => {
  const p = browserPlatform('http://x');
  await p.connections.upsert(fakeConnection());
  const out = await p.connections.upsert(fakeConnection({ access_token: 'new' }));
  expect(out.items).toHaveLength(1);
  expect(out.items[0]?.access_token).toBe('new');
});

it('discover is empty, there is no window and probe reports a network error offline', async () => {
  const p = browserPlatform('http://127.0.0.1:1');
  expect(await p.discover()).toEqual([]);
  expect(p.window).toBeNull();
  expect((await p.probe('http://127.0.0.1:1')).error).toBe('network');
});

it('saveFile downloads through an object URL and revokes it', async () => {
  const create = vi.fn(() => 'blob:x');
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const out = await browserPlatform('http://x').saveFile({
    suggestedName: 'a.csv',
    bytes: new Uint8Array([1]),
    mime: 'text/csv',
  });
  expect(out).toEqual({ saved: true });
  expect(create).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:x');
  click.mockRestore();
});

describe('notifications', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null where the browser has no Notification', () => {
    vi.stubGlobal('Notification', undefined);
    expect(browserPlatform('http://x').notifications).toBeNull();
  });

  it('maps the browser permission and request', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const n = browserPlatform('http://x').notifications!;
    expect(await n.permission()).toBe('prompt');
    expect(await n.request()).toBe('granted');
    requestPermission.mockResolvedValueOnce('default');
    expect(await n.request()).toBe('denied');
    requestPermission.mockRejectedValueOnce(new Error('x'));
    expect(await n.request()).toBe('denied');
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    expect(await browserPlatform('http://x').notifications!.permission()).toBe('denied');
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    expect(await browserPlatform('http://x').notifications!.permission()).toBe('granted');
  });

  it('sends through the Notification constructor', async () => {
    const ctor = vi.fn();
    vi.stubGlobal('Notification', ctor);
    await browserPlatform('http://x').notifications!.send({ title: 'T', body: 'B' });
    expect(ctor).toHaveBeenCalledWith('T', { body: 'B' });
  });
});

it('has no autostart', () => {
  expect(browserPlatform('http://x').autostart).toBeUndefined();
});

describe('downloadToFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches with the headers, proposes the name of Content-Disposition and revokes the URL', async () => {
    const create = vi.fn(() => 'blob:y');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let name = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('bytes', { status: 200, headers: { 'content-disposition': "attachment; filename=\"x.epub\"; filename*=UTF-8''Eco%20-%20Rosa.epub" } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await browserPlatform('http://x/').downloadToFile({
      url: '/api/v1/books/b1/files/f1/content',
      suggestedName: 'fallback.epub',
      headers: { Authorization: 'Bearer t' },
    });
    expect(out).toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith('http://x/api/v1/books/b1/files/f1/content', { headers: { Authorization: 'Bearer t' } });
    expect(name).toBe('Eco - Rosa.epub');
    expect(revoke).toHaveBeenCalledWith('blob:y');
    click.mockRestore();
  });

  it('reports a refusal by its status and saves nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await browserPlatform('http://x').downloadToFile({ url: '/api/v1/x', suggestedName: 'a' })).toEqual({ saved: false, status: 404 });
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('rejects with a network error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    const failure = await browserPlatform('http://x')
      .downloadToFile({ url: '/api/v1/x', suggestedName: 'a' })
      .then(() => null, (e: unknown) => e);
    expect((failure as { code?: string }).code).toBe('network');
  });
});
