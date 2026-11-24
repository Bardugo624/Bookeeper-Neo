import { describe, expect, it } from 'vitest';
import { ApiError, createClient, type Transport } from './index';

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
const B = '/api/v1';

describe('resource routes', () => {
  it('books', async () => {
    const { c, calls } = rec();
    await c.createBook({ title: 't' });
    await c.getBook('1');
    await c.updateBook('1', { title: 'x' });
    await c.deleteBooks(['1', '2']);
    await c.nextProgressive();
    await c.listBooks();
    expect(calls).toEqual([
      ['POST', `${B}/books`, { title: 't' }],
      ['GET', `${B}/books/1`, undefined],
      ['PATCH', `${B}/books/1`, { title: 'x' }],
      ['POST', `${B}/books/batch-delete`, { ids: ['1', '2'] }],
      ['GET', `${B}/books/next-progressive`, undefined],
      ['GET', `${B}/books`, undefined],
    ]);
  });
  it('shelves', async () => {
    const { c, calls } = rec();
    await c.listShelves();
    await c.createShelf({ name: 'n', rows: 2, slots_per_row: 10 });
    await c.getShelf('s');
    await c.updateShelf('s', { name: 'm' });
    await c.listShelfBooks('s');
    await c.placeBook('b', { shelf_id: 's', row_index: 0, slot_index: 1 });
    await c.batchAssign('s', ['b']);
    expect(calls).toEqual([
      ['GET', `${B}/shelves`, undefined],
      ['POST', `${B}/shelves`, { name: 'n', rows: 2, slots_per_row: 10 }],
      ['GET', `${B}/shelves/s`, undefined],
      ['PATCH', `${B}/shelves/s`, { name: 'm' }],
      ['GET', `${B}/shelves/s/books`, undefined],
      ['PUT', `${B}/books/b/placement`, { shelf_id: 's', row_index: 0, slot_index: 1 }],
      ['POST', `${B}/shelves/s/batch-assign`, { book_ids: ['b'] }],
    ]);
  });
  it('loans, wishlist, stats', async () => {
    const { c, calls } = rec();
    await c.listLoans();
    await c.listLoans({ status: 'all', book_id: 'b' });
    await c.createLoan({ book_id: 'b', borrower_name: 'x' });
    await c.updateLoan('1', { notes: 'n' });
    await c.returnLoan('1');
    await c.returnLoan('1', 1700000000);
    await c.reopenLoan('1');
    await c.listWishlist();
    await c.createWish({ title: 'w' });
    await c.updateWish('1', { priority: 1 });
    await c.convertWish('1');
    await c.stats();
    expect(calls).toEqual([
      ['GET', `${B}/loans`, undefined],
      ['GET', `${B}/loans?status=all&book_id=b`, undefined],
      ['POST', `${B}/loans`, { book_id: 'b', borrower_name: 'x' }],
      ['PATCH', `${B}/loans/1`, { notes: 'n' }],
      ['POST', `${B}/loans/1/return`, {}],
      ['POST', `${B}/loans/1/return`, { returned_at: 1700000000 }],
      ['POST', `${B}/loans/1/reopen`, undefined],
      ['GET', `${B}/wishlist`, undefined],
      ['POST', `${B}/wishlist`, { title: 'w' }],
      ['PATCH', `${B}/wishlist/1`, { priority: 1 }],
      ['POST', `${B}/wishlist/1/convert`, undefined],
      ['GET', `${B}/stats`, undefined],
    ]);
  });
  it('204 deletes resolve undefined', async () => {
    const { c, calls } = rec(204, undefined);
    expect(await c.deleteBook('1')).toBeUndefined();
    expect(await c.deleteShelf('1')).toBeUndefined();
    expect(await c.unplaceBook('1')).toBeUndefined();
    expect(await c.deleteLoan('1')).toBeUndefined();
    expect(await c.deleteWish('1')).toBeUndefined();
    expect(calls.map((x) => x[0])).toEqual(['DELETE', 'DELETE', 'DELETE', 'DELETE', 'DELETE']);
    expect(calls.map((x) => [x[0], x[1]])).toEqual([
      ['DELETE', `${B}/books/1`],
      ['DELETE', `${B}/shelves/1`],
      ['DELETE', `${B}/books/1/placement`],
      ['DELETE', `${B}/loans/1`],
      ['DELETE', `${B}/wishlist/1`],
    ]);
  });
});

describe('query and encoding', () => {
  it('encodes and orders params, omits undefined', async () => {
    const { c, calls } = rec();
    await c.listBooks({ q: 'il nome della rosa', on_loan: false, limit: 20 });
    await c.listBooks({ q: undefined, genre: 'giallo' });
    await c.getBook('a/b');
    expect(calls[0]![1]).toBe(`${B}/books?q=il%20nome%20della%20rosa&on_loan=false&limit=20`);
    expect(calls[1]![1]).toBe(`${B}/books?genre=giallo`);
    expect(calls[2]![1]).toBe(`${B}/books/a%2Fb`);
  });
  it('sends null, omits undefined in patches', async () => {
    const { c, calls } = rec();
    await c.updateBook('1', { subtitle: null });
    expect(JSON.stringify(calls[0]![2])).toBe('{"subtitle":null}');
  });
  it('maps 409 slot_taken to ApiError', async () => {
    const { c } = rec(409, { error_code: 'slot_taken', message: 'x' });
    const p = c.placeBook('b', { shelf_id: 's', row_index: 0, slot_index: 0 });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ status: 409, code: 'slot_taken' });
  });
});

describe('server info', () => {
  it('getServerInfo requests GET /api/v1/server', async () => {
    const { c, calls } = rec(200, { version: '1', tls: 'off', public_url: null, phone_ready: false });
    await c.getServerInfo();
    expect(calls).toEqual([['GET', `${B}/server`, undefined]]);
  });
  it('getServerInfo works without a session', async () => {
    let refreshes = 0;
    const t: Transport = {
      request: async (_m, p) => {
        if (p.includes('/auth/refresh')) refreshes++;
        return { status: 200, body: { version: '1', tls: 'off', public_url: null, phone_ready: false } };
      },
    };
    const info = await createClient(t).getServerInfo();
    expect(info.version).toBe('1');
    expect(refreshes).toBe(0);
  });
  it('getServerInfo returns the body as is', async () => {
    const body = { version: '1', tls: 'off', public_url: null, phone_ready: false };
    const { c } = rec(200, body);
    expect(await c.getServerInfo()).toEqual(body);
  });
});
