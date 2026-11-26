import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';

export type NewInvite = S['NewInvite'];
export type InviteCreated = S['InviteCreated'];
export type InviteOut = S['InviteOut'];
export type InviteList = S['InviteList'];
export type InviteRole = S['InviteRole'];

export function invitesApi(t: Transport) {
  return {
    async createInvite(body: NewInvite) {
      return unwrap<InviteCreated>(await t.request('POST', `${P}/invites`, body));
    },
    async listInvites() {
      return unwrap<InviteList>(await t.request('GET', `${P}/invites`));
    },
    async revokeInvite(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/invites/${enc(id)}`));
    },
  };
}
