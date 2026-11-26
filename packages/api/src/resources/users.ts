import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';

export type PersonOut = S['PersonOut'];
export type PeopleList = S['PeopleList'];
export type PatchPerson = S['PatchPerson'];

export function usersApi(t: Transport) {
  return {
    async listUsers() {
      return unwrap<PeopleList>(await t.request('GET', `${P}/users`));
    },
    async updateUser(id: string, patch: PatchPerson) {
      return unwrap<PersonOut>(await t.request('PATCH', `${P}/users/${enc(id)}`, patch));
    },
    async removeUser(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/users/${enc(id)}`));
    },
    async transferOwnership(id: string) {
      unwrapEmpty(await t.request('POST', `${P}/users/${enc(id)}/owner`));
    },
  };
}
