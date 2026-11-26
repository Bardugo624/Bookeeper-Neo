import { describe, expect, it } from 'vitest';
import { DAY, loan } from './testkit';
import { durationDays, groupByMonth, lateDays, matchesText, summarize } from './history';

const at = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);

describe('history helpers', () => {
  it('durationDays and lateDays', () => {
    const l = loan(1, { lent_at: 1000, due_at: 1000 + 10 * DAY, returned_at: 1000 + 14 * DAY });
    expect(durationDays(l)).toBe(14);
    expect(lateDays(l)).toBe(4);
    expect(lateDays({ ...l, returned_at: 1000 + 9 * DAY })).toBe(0);
    expect(lateDays({ ...l, due_at: null })).toBe(0);
  });

  it('groups by month of return, newest first', () => {
    const g = groupByMonth([
      loan(1, { returned_at: at(2024, 1, 5) }),
      loan(2, { returned_at: at(2024, 3, 2) }),
      loan(3, { returned_at: at(2024, 1, 20) }),
      loan(4),
    ]);
    expect(g.map((x) => x.key)).toEqual(['2024-03', '2024-01']);
    expect(g[1]!.loans.map((l) => l.id)).toEqual(['l3', 'l1']);
  });

  it('summarizes with average and most frequent person', () => {
    const s = summarize([
      loan(1, { borrower_name: 'Anna', lent_at: 0, returned_at: 10 * DAY }),
      loan(2, { borrower_name: 'anna', lent_at: 0, returned_at: 20 * DAY }),
      loan(3, { borrower_name: 'Bruno', lent_at: 0, returned_at: 6 * DAY }),
      loan(4),
    ]);
    expect(s).toEqual({ closed: 3, averageDays: 12, topBorrower: { name: 'Anna', count: 2 } });
    expect(summarize([]).averageDays).toBeNull();
  });

  it('matches person or title', () => {
    expect(matchesText(loan(1, { borrower_name: 'Maria' }), 'mar')).toBe(true);
    expect(matchesText(loan(1), 'libro 1')).toBe(true);
    expect(matchesText(loan(1), 'zzz')).toBe(false);
  });
});
