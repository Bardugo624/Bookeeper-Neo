import { P, S, enc, okRaw, parseJsonRaw, raw, unwrap, unwrapEmpty, type Transport } from './util';

export type CoverColor = S['CoverColor'];
export type CoverFetched = S['CoverFetched'];
export type FetchCover = S['FetchCover'];

export function coversApi(t: Transport) {
  return {
    async getCover(bookId: string, opts: { ifNoneMatch?: string } = {}) {
      const r = await raw(t, {
        method: 'GET',
        path: `${P}/books/${enc(bookId)}/cover`,
        ...(opts.ifNoneMatch ? { headers: { 'if-none-match': opts.ifNoneMatch } } : {}),
      });
      if (r.status === 304) return null;
      okRaw(r);
      return { bytes: r.bytes, etag: r.headers.etag ?? null };
    },
    async uploadCover(bookId: string, bytes: Uint8Array) {
      const r = await raw(t, {
        method: 'PUT',
        path: `${P}/books/${enc(bookId)}/cover`,
        body: bytes,
        contentType: 'application/octet-stream',
      });
      return parseJsonRaw<CoverColor>(r);
    },
    async fetchCover(bookId: string, candidates: string[]) {
      return unwrap<CoverFetched>(await t.request('POST', `${P}/books/${enc(bookId)}/cover/fetch`, { candidates }));
    },
    async deleteCover(bookId: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/books/${enc(bookId)}/cover`));
    },
  };
}
