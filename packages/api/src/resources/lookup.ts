import { P, S, enc, qs, unwrap, type Transport } from './util';

export type Metadata = S['Metadata'];

export function lookupApi(t: Transport) {
  return {
    async lookupIsbn(isbn: string, opts: { fresh?: boolean } = {}) {
      const q = opts.fresh ? qs({ fresh: true }) : '';
      return unwrap<Metadata>(await t.request('GET', `${P}/lookup/isbn/${enc(isbn)}${q}`));
    },
  };
}
