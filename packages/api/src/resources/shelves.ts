import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';

export type ShelfOut = S['ShelfOut'];
export type ShelfBook = S['ShelfBook'];
export type ShelfList = S['ShelfList'];
export type ShelfBookList = S['ShelfBookList'];
export type NewShelf = S['NewShelf'];
export type ShelfPatch = S['ShelfPatch'];
export type PlaceIn = S['PlaceIn'];
export type BatchAssignOut = S['BatchAssignOut'];
export type PlacementOut = S['Placement'];

export function shelvesApi(t: Transport) {
  return {
    async listShelves() {
      return unwrap<ShelfList>(await t.request('GET', `${P}/shelves`));
    },
    async createShelf(body: NewShelf) {
      return unwrap<ShelfOut>(await t.request('POST', `${P}/shelves`, body));
    },
    async getShelf(id: string) {
      return unwrap<ShelfOut>(await t.request('GET', `${P}/shelves/${enc(id)}`));
    },
    async updateShelf(id: string, patch: ShelfPatch) {
      return unwrap<ShelfOut>(await t.request('PATCH', `${P}/shelves/${enc(id)}`, patch));
    },
    async deleteShelf(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/shelves/${enc(id)}`));
    },
    async listShelfBooks(id: string) {
      return unwrap<ShelfBookList>(await t.request('GET', `${P}/shelves/${enc(id)}/books`));
    },
    async placeBook(bookId: string, placement: PlaceIn) {
      return unwrap<PlacementOut>(await t.request('PUT', `${P}/books/${enc(bookId)}/placement`, placement));
    },
    async unplaceBook(bookId: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/books/${enc(bookId)}/placement`));
    },
    async batchAssign(shelfId: string, bookIds: string[]) {
      return unwrap<BatchAssignOut>(
        await t.request('POST', `${P}/shelves/${enc(shelfId)}/batch-assign`, { book_ids: bookIds }),
      );
    },
  };
}
