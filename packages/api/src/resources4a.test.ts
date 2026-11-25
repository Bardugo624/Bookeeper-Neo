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

describe('phase 4a routes', () => {
  it('reading', async () => {
    const { c, calls } = rec();
    await c.setReading('b', { status: 'reading', current_page: 3 });
    await c.listReading();
    await c.listReading({ status: 'read', limit: 5, offset: 10 });
    expect(calls).toEqual([
      ['PUT', `${B}/books/b/reading`, { status: 'reading', current_page: 3 }],
      ['GET', `${B}/reading`, undefined],
      ['GET', `${B}/reading?status=read&limit=5&offset=10`, undefined],
    ]);
  });
  it('getReading returns null for a null body and the state otherwise', async () => {
    const a = rec(200, null);
    expect(await a.c.getReading('b')).toBeNull();
    expect(a.calls).toEqual([['GET', `${B}/books/b/reading`, undefined]]);
    const body = { book_id: 'b', status: 'read' };
    expect(await rec(200, body).c.getReading('b')).toEqual(body);
  });
  it('clearReading and deleteTag accept 204 without body', async () => {
    const { c, calls } = rec(204, null);
    await expect(c.clearReading('b')).resolves.toBeUndefined();
    await expect(c.deleteTag('t')).resolves.toBeUndefined();
    await expect(c.deleteRoom('r')).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['DELETE', `${B}/books/b/reading`, undefined],
      ['DELETE', `${B}/tags/t`, undefined],
      ['DELETE', `${B}/rooms/r`, undefined],
    ]);
  });
  it('tags', async () => {
    const { c, calls } = rec();
    await c.listTags();
    await c.createTag({ name: 'n', color: 'red' } as never);
    await c.updateTag('t', { name: 'm' });
    await c.setBookTags('b', ['t1', 't2']);
    expect(calls).toEqual([
      ['GET', `${B}/tags`, undefined],
      ['POST', `${B}/tags`, { name: 'n', color: 'red' }],
      ['PATCH', `${B}/tags/t`, { name: 'm' }],
      ['PUT', `${B}/books/b/tags`, { tag_ids: ['t1', 't2'] }],
    ]);
  });
  it('rooms', async () => {
    const { c, calls } = rec();
    await c.listRooms();
    await c.createRoom({ name: 'n' });
    await c.updateRoom('r', { name: 'm' });
    expect(calls).toEqual([
      ['GET', `${B}/rooms`, undefined],
      ['POST', `${B}/rooms`, { name: 'n' }],
      ['PATCH', `${B}/rooms/r`, { name: 'm' }],
    ]);
  });
  it('audit, borrowers, reading stats, facets', async () => {
    const { c, calls } = rec();
    await c.listAudit();
    await c.listAudit({ action: 'book.create', limit: 20, from: 1 });
    await c.listAuditActions();
    await c.listBorrowers();
    await c.listBorrowers('Ma r');
    await c.getReadingStats();
    await c.getReadingStats(2025);
    await c.getBookFacets();
    expect(calls).toEqual([
      ['GET', `${B}/audit`, undefined],
      ['GET', `${B}/audit?action=book.create&limit=20&from=1`, undefined],
      ['GET', `${B}/audit/actions`, undefined],
      ['GET', `${B}/loans/borrowers`, undefined],
      ['GET', `${B}/loans/borrowers?q=Ma%20r`, undefined],
      ['GET', `${B}/stats/reading`, undefined],
      ['GET', `${B}/stats/reading?year=2025`, undefined],
      ['GET', `${B}/books/facets`, undefined],
    ]);
  });
  it('listBooks serializes tag_id as a repeated key', async () => {
    const { c, calls } = rec();
    await c.listBooks({ tag_id: ['a', 'b'], reading: 'none', year_from: 1990, on_loan: true });
    await c.listBooks({ tag_id: [] });
    expect(calls[0][1]).toBe(`${B}/books?tag_id=a&tag_id=b&reading=none&year_from=1990&on_loan=true`);
    expect(calls[1][1]).toBe(`${B}/books`);
  });
  it('errors become ApiError with the core code', async () => {
    const err = async (call: (c: ReturnType<typeof createClient>) => Promise<unknown>, status: number, code: string) => {
      const { c } = rec(status, { error_code: code, message: 'm' });
      const e = await call(c).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(status);
      expect((e as ApiError).code).toBe(code);
    };
    await err((c) => c.getReading('b'), 404, 'not_found');
    await err((c) => c.clearReading('b'), 403, 'forbidden');
    await err((c) => c.createTag({ name: 'x', color: 'red' } as never), 409, 'tag_exists');
    await err((c) => c.deleteTag('t'), 404, 'not_found');
    await err((c) => c.createRoom({ name: 'x' }), 409, 'room_exists');
    await err((c) => c.listAudit(), 403, 'forbidden');
  });
});
