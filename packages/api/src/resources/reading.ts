import { P, S, enc, fail, qs, unwrapEmpty, unwrap, type Transport } from './util';

export type ReadingOut = S['ReadingOut'];
export type PutReading = S['PutReading'];
export type ReadingList = S['ReadingList'];
export type ReadingSummary = S['ReadingSummary'];
export type ListReadingParams = S['ReadingQuery'];

export function readingApi(t: Transport) {
  return {
    /** `null` when the caller has no state for the book. */
    async getReading(bookId: string): Promise<ReadingOut | null> {
      const r = await t.request('GET', `${P}/books/${enc(bookId)}/reading`);
      if (r.status >= 200 && r.status < 300) return r.body === null || r.body === undefined ? null : (r.body as ReadingOut);
      return fail(r);
    },
    async setReading(bookId: string, body: PutReading) {
      return unwrap<ReadingOut>(await t.request('PUT', `${P}/books/${enc(bookId)}/reading`, body));
    },
    async clearReading(bookId: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/books/${enc(bookId)}/reading`));
    },
    async listReading(params?: ListReadingParams) {
      return unwrap<ReadingList>(await t.request('GET', `${P}/reading${qs(params)}`));
    },
  };
}
