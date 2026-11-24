import { P, S, unwrap, type Transport } from './util';

export type Stats = S['Stats'];

export function statsApi(t: Transport) {
  return {
    async stats() {
      return unwrap<Stats>(await t.request('GET', `${P}/stats`));
    },
  };
}
