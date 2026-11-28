import { P, S, enc, unwrap, type Transport } from './util';

export type PositionOut = S['PositionOut'];
export type PutPosition = S['PutPosition'];
export type { ReadingOut } from './reading';

export function positionsApi(t: Transport) {
  return {
    async listPositions(bookId: string) {
      return unwrap<PositionOut[]>(await t.request('GET', `${P}/books/${enc(bookId)}/positions`));
    },
    /** Answers the caller's reading state, or `null` when there is none yet. */
    async putPosition(bookId: string, fileId: string, body: PutPosition) {
      const r = await t.request('PUT', `${P}/books/${enc(bookId)}/files/${enc(fileId)}/position`, body);
      if (r.status >= 200 && r.status < 300 && (r.body === null || r.body === undefined)) return null;
      return unwrap<S['ReadingOut']>(r);
    },
  };
}
