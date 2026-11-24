import { P, encodeJson, JSON_CT, okRaw, raw, type Transport } from './util';

export function labelsApi(t: Transport) {
  return {
    async labelsPdf(bookIds: string[]) {
      const r = okRaw(
        await raw(t, { method: 'POST', path: `${P}/labels/pdf`, body: encodeJson({ book_ids: bookIds }), contentType: JSON_CT }),
      );
      const n = Number(r.headers['x-labels-skipped']);
      return { bytes: r.bytes, skipped: Number.isFinite(n) ? n : 0 };
    },
  };
}
