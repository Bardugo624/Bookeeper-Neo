import { beforeEach, expect, it, vi } from 'vitest';
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
