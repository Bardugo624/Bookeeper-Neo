import { useSearchParams } from 'react-router';
import { oneOfParam, stringParam, useListParams, type ListParams } from '../../kit';

export const FILTERS = ['active', 'overdue', 'returned', 'all'] as const;
export type LoanFilter = (typeof FILTERS)[number];

export interface LoanListValues {
  filter: LoanFilter;
  book: string;
  borrower: string;
  /** `1` shows the loans made to who is looking (`borrower_user_id=me`). */
  mine: string;
  /** `1` opens "New loan" (used by the command palette). */
  new: string;
}

const SCHEMA = {
  filter: oneOfParam(FILTERS, 'active'),
  book: stringParam(''),
  borrower: stringParam(''),
  mine: stringParam(''),
  new: stringParam(''),
};

/**
 * Filter and book are kept in the address; the default filter ("active") is left out of it. A person without
 * an explicit filter means "all their loans", so `/loans?borrower=Anna` shows more than the ones still out.
 */
export function useLoanParams(): ListParams<LoanListValues> & { pickFilter(filter: LoanFilter | 'mine'): void } {
  const base = useListParams<LoanListValues>(SCHEMA);
  const [raw, setRaw] = useSearchParams();
  const implicit = (base.values.borrower !== '' || base.values.mine === '1') && !raw.has('filter');
  const values = implicit ? { ...base.values, filter: 'all' as const } : base.values;
  return {
    ...base,
    values,
    pickFilter: (filter) => {
      if (filter === 'mine') {
        base.set({ mine: '1', borrower: '', filter: 'all' });
        return;
      }
      // With a person chosen, "active" has to stay in the address: left out, it would read as "all".
      if (filter === 'active' && base.values.borrower !== '') {
        setRaw((prev) => {
          const out = new URLSearchParams(prev);
          out.set('filter', 'active');
          out.delete('mine');
          return out;
        }, { replace: true });
      } else base.set({ filter, mine: '' });
    },
  };
}
