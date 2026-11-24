import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';
import type { BookOut } from './books';

export type WishOut = S['WishOut'];
export type WishList = S['WishList'];
export type CreateWish = S['CreateWish'];
export type PatchWish = S['PatchWish'];

export function wishlistApi(t: Transport) {
  return {
    async listWishlist() {
      return unwrap<WishList>(await t.request('GET', `${P}/wishlist`));
    },
    async createWish(body: CreateWish) {
      return unwrap<WishOut>(await t.request('POST', `${P}/wishlist`, body));
    },
    async updateWish(id: string, patch: PatchWish) {
      return unwrap<WishOut>(await t.request('PATCH', `${P}/wishlist/${enc(id)}`, patch));
    },
    async deleteWish(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/wishlist/${enc(id)}`));
    },
    async convertWish(id: string) {
      return unwrap<BookOut>(await t.request('POST', `${P}/wishlist/${enc(id)}/convert`));
    },
  };
}
