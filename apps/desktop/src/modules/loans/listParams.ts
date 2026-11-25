import { oneOfParam, stringParam, useListParams, type ListParams } from '../../kit';

export const FILTERS = ['active', 'overdue', 'returned', 'all'] as const;
export type LoanFilter = (typeof FILTERS)[number];

export interface LoanListValues {
  filter: LoanFilter;
  book: string;
}

const SCHEMA = {
  filter: oneOfParam(FILTERS, 'active'),
  book: stringParam(''),
};

/** Filter and book are kept in the address; the default filter ("active") is left out of it. */
export function useLoanParams(): ListParams<LoanListValues> {
  return useListParams<LoanListValues>(SCHEMA);
}
