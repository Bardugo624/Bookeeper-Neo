import { describe, expect, it } from 'vitest';
import { ApiError, createClient, type Transport } from './index';

const rec = (status = 200, body: unknown = {}, extra: Record<string, unknown> = {}) => {
  const calls: Array<[string, string, unknown]> = [];
  const t: Transport = {
    request: async (m, p, b) => {
      calls.push([m, p, b]);
      return { status, body, ...extra };
    },
  };
  return { calls, c: createClient(t) };
};
const B = '/api/v1';

describe('phase 6a routes', () => {
  it('users', async () => {
    const { c, calls } = rec();
    await c.listUsers();
    await c.updateUser('u/1', { display_name: 'Ann', role: 'admin' });
    expect(calls).toEqual([
      ['GET', `${B}/users`, undefined],
      ['PATCH', `${B}/users/u%2F1`, { display_name: 'Ann', role: 'admin' }],
    ]);
  });
  it('removeUser, transferOwnership and revokeInvite accept 204', async () => {
    const { c, calls } = rec(204, null);
    await expect(c.removeUser('u')).resolves.toBeUndefined();
    await expect(c.transferOwnership('u')).resolves.toBeUndefined();
    await expect(c.revokeInvite('i')).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['DELETE', `${B}/users/u`, undefined],
      ['POST', `${B}/users/u/owner`, undefined],
      ['DELETE', `${B}/invites/i`, undefined],
    ]);
  });
  it('invites', async () => {
    const { c, calls } = rec(201);
    await c.createInvite({ role: 'member', expires_in_days: 3 });
    await c.listInvites();
    expect(calls).toEqual([
      ['POST', `${B}/invites`, { role: 'member', expires_in_days: 3 }],
      ['GET', `${B}/invites`, undefined],
    ]);
  });
  it('readers and isbn index', async () => {
    const { c, calls } = rec();
    await c.listReaders('b');
    await c.isbnIndex();
    await c.isbnIndex('abc/1');
    expect(calls).toEqual([
      ['GET', `${B}/books/b/readers`, undefined],
      ['GET', `${B}/books/isbn-index`, undefined],
      ['GET', `${B}/books/isbn-index?version=abc%2F1`, undefined],
    ]);
  });
  it('inspectPairingCode posts the code and redeem passes display_name', async () => {
    const { c, calls } = rec();
    await c.inspectPairingCode({ code: 'ABC' });
    await c.redeemPairingCode({ code: 'ABC', device_name: 'd', device_kind: 'mobile', display_name: 'Ann' });
    expect(calls).toEqual([
      ['POST', `${B}/pairing/inspect`, { code: 'ABC' }],
      ['POST', `${B}/pairing/redeem`, { code: 'ABC', device_name: 'd', device_kind: 'mobile', display_name: 'Ann' }],
    ]);
  });
  it('translates errors', async () => {
    const body = { error_code: 'forbidden', message: 'no' };
    const { c } = rec(403, body);
    for (const p of [c.listUsers(), c.removeUser('u'), c.createInvite({ role: 'guest' }), c.listReaders('b'), c.isbnIndex()]) {
      await expect(p).rejects.toMatchObject({ status: 403, code: 'forbidden' });
      await expect(p).rejects.toBeInstanceOf(ApiError);
    }
    const r = rec(429, { error_code: 'rate_limited', message: 'slow' }, { retryAfter: 7 });
    await expect(r.c.inspectPairingCode({ code: 'x' })).rejects.toMatchObject({ status: 429, retryAfter: 7 });
  });
});
