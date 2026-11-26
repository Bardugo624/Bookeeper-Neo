import { P, S, enc, qs, unwrap, unwrapEmpty, type Transport } from './util';

export type BookOut = S['BookOut'];
export type CreateBook = S['CreateBook'];
export type PatchBook = S['PatchBook'];
export type BookList = S['BookList'];
export type BatchDeleted = S['BatchDeleted'];
export type NextProgressive = S['NextProgressive'];
export type Placement = S['Placement'];
export type BookFacets = S['Facets'];
export type Reader = S['Reader'];
export type ReaderList = S['ReaderList'];
export type IsbnIndex = S['IsbnIndex'];
export type IsbnEntry = S['IsbnEntry'];
export type ListBooksParams = Omit<S['ListBooksQuery'], 'on_loan' | 'unshelved'> & {
  on_loan?: boolean | null;
  unshelved?: boolean | null;
  /** Repeatable: the book must have all the given tags. */
  tag_id?: string[] | null;
};

export function booksApi(t: Transport) {
  return {
    async createBook(body: CreateBook) {
      return unwrap<BookOut>(await t.request('POST', `${P}/books`, body));
    },
    async getBook(id: string) {
      return unwrap<BookOut>(await t.request('GET', `${P}/books/${enc(id)}`));
    },
    async updateBook(id: string, patch: PatchBook) {
      return unwrap<BookOut>(await t.request('PATCH', `${P}/books/${enc(id)}`, patch));
    },
    async deleteBook(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/books/${enc(id)}`));
    },
    async deleteBooks(ids: string[]) {
      return unwrap<BatchDeleted>(await t.request('POST', `${P}/books/batch-delete`, { ids }));
    },
    async nextProgressive() {
      return unwrap<NextProgressive>(await t.request('GET', `${P}/books/next-progressive`));
    },
    async listBooks(params?: ListBooksParams) {
      return unwrap<BookList>(await t.request('GET', `${P}/books${qs(params)}`));
    },
    async getBookFacets() {
      return unwrap<BookFacets>(await t.request('GET', `${P}/books/facets`));
    },
    async listReaders(bookId: string) {
      return unwrap<ReaderList>(await t.request('GET', `${P}/books/${enc(bookId)}/readers`));
    },
    /** Pass the `version` of a previous answer: when it is still current, `unchanged` is true and `items` is empty. */
    async isbnIndex(version?: string) {
      return unwrap<IsbnIndex>(await t.request('GET', `${P}/books/isbn-index${qs({ version })}`));
    },
  };
}
