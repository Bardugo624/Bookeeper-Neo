import { P, S, unwrap, type Transport } from './util';

export type ServerInfo = S['ServerOut'];
export type TlsMode = S['TlsMode'];

export function serverApi(t: Transport) {
  return {
    async getServerInfo() {
      return unwrap<ServerInfo>(await t.request('GET', `${P}/server`));
    },
  };
}
