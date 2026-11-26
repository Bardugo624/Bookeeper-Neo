import { P, S, qs, unwrap, type Transport } from './util';

export type Stats = S['Stats'];
export type ReadingStats = S['ReadingStats'];

export function statsApi(t: Transport) {
  return {
    async stats() {
      return unwrap<Stats>(await t.request('GET', `${P}/stats`));
    },
    async getReadingStats(year?: number) {
      return unwrap<ReadingStats>(await t.request('GET', `${P}/stats/reading${qs({ year })}`));
    },
  };
}
