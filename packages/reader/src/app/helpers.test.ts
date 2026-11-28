import { describe, expect, it } from 'vitest';
import en from '../../../i18n/src/locales/en/reader.json';
import it_ from '../../../i18n/src/locales/it/reader.json';
import { sinceText } from './helpers';

type Dict = { resume: Record<string, string> };
const make = (d: Dict) => (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), d.resume[key.split('.')[2]!]!);

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = local(2026, 11, 28, 16, 0);

describe('sinceText', () => {
  it('when_reads_now_today_yesterday_and_dates', () => {
    const cases: [number, string, string][] = [
      [NOW - 30_000, 'adesso', 'just now'],
      [local(2026, 11, 28, 15, 49), 'alle 15:49', 'at 15:49'],
      [local(2026, 11, 27, 22, 40), 'ieri alle 22:40', 'yesterday at 22:40'],
      [local(2026, 11, 26, 9, 0), 'il 26 novembre', 'on 26 November'],
      [local(2026, 11, 8, 9, 0), "l'8 novembre", 'on 8 November'],
      [local(2026, 11, 11, 9, 0), "l'11 novembre", 'on 11 November'],
      [local(2026, 11, 1, 9, 0), 'il 1° novembre', 'on 1 November'],
      [local(2025, 11, 26, 9, 0), 'il 26 novembre 2025', 'on 26 November 2025'],
    ];
    for (const [at, it, e] of cases) {
      expect(sinceText(make(it_ as Dict), 'it', at / 1000, NOW)).toBe(it);
      expect(sinceText(make(en as Dict), 'en', at / 1000, NOW)).toBe(e);
    }
  });
});
