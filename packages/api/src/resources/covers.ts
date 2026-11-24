import { P, S, enc, encodeJson, JSON_CT, okRaw, parseJsonRaw, raw, unwrapEmpty, type Transport } from './util';

export type CoverColor = S['CoverColor'];
export type CoverFetched = S['CoverFetched'];

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
      const r = await raw(t, {
        method: 'POST',
        path: `${P}/books/${enc(bookId)}/cover/fetch`,
        body: encodeJson({ candidates }),
        contentType: JSON_CT,
      });
      return parseJsonRaw<CoverFetched>(r);
    },
    async deleteCover(bookId: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/books/${enc(bookId)}/cover`));
    },
  };
}
