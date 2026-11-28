import { P, S, enc, qs, unwrap, type Transport } from './util';

export type AnnotationOut = S['AnnotationOut'];
export type PutAnnotation = S['PutAnnotation'];

export function annotationsApi(t: Transport) {
  return {
    /** Without `since`, the live ones; with it, everything changed after, deleted included. */
    async listAnnotations(bookId: string, since?: number) {
      return unwrap<AnnotationOut[]>(
        await t.request('GET', `${P}/books/${enc(bookId)}/annotations${qs({ since })}`),
      );
    },
    async putAnnotation(bookId: string, id: string, body: PutAnnotation) {
      return unwrap<AnnotationOut>(
        await t.request('PUT', `${P}/books/${enc(bookId)}/annotations/${enc(id)}`, body),
      );
    },
  };
}
