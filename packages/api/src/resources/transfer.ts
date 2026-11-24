import { P, S, filenameOf, okRaw, raw, unwrap, type Transport } from './util';

export type ImportReport = S['ImportReport'];
export type ImportRequest = S['ImportRequest'];
export type ImportFormat = S['RequestFormat'];
export type ImportRowError = S['ImportRowError'];
export type ImportedBook = S['ImportedBook'];
export type ExportJson = S['ExportJson'];
export type ExportBook = S['ExportBook'];

export function transferApi(t: Transport) {
  return {
    async importBooks(body: ImportRequest) {
      return unwrap<ImportReport>(await t.request('POST', `${P}/import`, body));
    },
    async exportLibrary(format: 'json' | 'csv') {
      const r = okRaw(await raw(t, { method: 'GET', path: `${P}/export?format=${format}` }));
      return { bytes: r.bytes, filename: filenameOf(r, `bookeeper-export.${format}`) };
    },
  };
}
