import { P, S, encodeJson, filenameOf, JSON_CT, okRaw, parseJsonRaw, raw, type Transport } from './util';

export type ImportReport = S['ImportReport'];
export type ImportRequest = S['ImportRequest'];
export type ImportFormat = S['RequestFormat'];

export function transferApi(t: Transport) {
  return {
    async importBooks(body: ImportRequest) {
      const r = await raw(t, {
        method: 'POST',
        path: `${P}/import`,
        body: encodeJson(body),
        contentType: JSON_CT,
      });
      return parseJsonRaw<ImportReport>(r);
    },
    async exportLibrary(format: 'json' | 'csv') {
      const r = okRaw(await raw(t, { method: 'GET', path: `${P}/export?format=${format}` }));
      return { bytes: r.bytes, filename: filenameOf(r, `bookeeper-export.${format}`) };
    },
  };
}
