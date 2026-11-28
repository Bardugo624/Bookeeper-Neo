import { describe, expect, it } from 'vitest';
import { createClient, type PutAnnotation, type Transport } from './index';

const rec = () => {
  const calls: Array<[string, string, unknown]> = [];
  const t: Transport = {
    request: async (m, p, b) => {
      calls.push([m, p, b]);
      return { status: 200, body: m === 'GET' ? [] : {} };
    },
  };
  return { calls, c: createClient(t) };
};
const B = '/api/v1';

describe('annotations and positions', () => {
  it('listAnnotations passes since in the query', async () => {
    const { c, calls } = rec();
    await c.listAnnotations('b');
    await c.listAnnotations('b', 42);
    expect(calls).toEqual([
      ['GET', `${B}/books/b/annotations`, undefined],
      ['GET', `${B}/books/b/annotations?since=42`, undefined],
    ]);
  });
  it('putAnnotation, listPositions and putPosition use the right method and path', async () => {
    const { c, calls } = rec();
    const body = {
      file_sha256: 's', kind: 'bookmark', cfi: 'c', text: '', color: null, note: null, percent: 1,
      chapter: null, created_at: 1, updated_at: 2, deleted: false,
    } as PutAnnotation;
    await c.putAnnotation('b', 'a', body);
    await c.listPositions('b');
    await c.putPosition('b', 'f', { kind: 'cfi', value: 'v', percent: 3 });
    expect(calls).toEqual([
      ['PUT', `${B}/books/b/annotations/a`, body],
      ['GET', `${B}/books/b/positions`, undefined],
      ['PUT', `${B}/books/b/files/f/position`, { kind: 'cfi', value: 'v', percent: 3 }],
    ]);
  });
});
