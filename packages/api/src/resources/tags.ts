import type { BookOut } from './books';
import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';

export type TagOut = S['TagOut'];
export type TagList = S['TagList'];
export type TagSummary = S['TagSummary'];
export type CreateTag = S['CreateTag'];
export type PatchTag = S['PatchTag'];

export function tagsApi(t: Transport) {
  return {
    async listTags() {
      return unwrap<TagList>(await t.request('GET', `${P}/tags`));
    },
    async createTag(body: CreateTag) {
      return unwrap<TagOut>(await t.request('POST', `${P}/tags`, body));
    },
    async updateTag(id: string, patch: PatchTag) {
      return unwrap<TagOut>(await t.request('PATCH', `${P}/tags/${enc(id)}`, patch));
    },
    async deleteTag(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/tags/${enc(id)}`));
    },
    async setBookTags(bookId: string, tagIds: string[]) {
      return unwrap<BookOut>(await t.request('PUT', `${P}/books/${enc(bookId)}/tags`, { tag_ids: tagIds }));
    },
  };
}
