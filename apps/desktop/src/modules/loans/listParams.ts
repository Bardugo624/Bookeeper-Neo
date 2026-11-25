import { oneOfParam, stringParam, useListParams, type ListParams } from '../../kit';

export const FILTERS = ['active', 'overdue', 'returned', 'all'] as const;
export type LoanFilter = (typeof FILTERS)[number];

export interface LoanListValues {
  filter: LoanFilter;
  book: string;
  borrower: string;
  /** `1` opens "New loan" (used by the command palette). */
  new: string;
}

const SCHEMA = {
  filter: oneOfParam(FILTERS, 'active'),
  book: stringParam(''),
  borrower: stringParam(''),
  new: stringParam(''),
};

/** Filter and book are kept in the address; the default filter ("active") is left out of it. */
export function useLoanParams(): ListParams<LoanListValues> {
  return useListParams<LoanListValues>(SCHEMA);
}
