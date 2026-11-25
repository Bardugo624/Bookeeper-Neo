import { useQuery } from '@tanstack/react-query';
import type { LoanOut } from '@bookeeper/api';
import { useClient } from '../../session';
import { useLoansKey } from './useLoans';

export interface ActiveLoan {
  /** The open loan of the book; undefined when the book is free (or still loading). */
  loan: LoanOut | undefined;
  isPending: boolean;
  isError: boolean;
}

/** Open loan of a book, if any. */
export function useActiveLoan(bookId: string): ActiveLoan {
  const client = useClient();
  const key = useLoansKey();
  const query = useQuery({
    queryKey: [...key, 'active', bookId],
    retry: false,
    queryFn: () => client.listLoans({ book_id: bookId, status: 'active', limit: 1 }),
  });
  return { loan: query.data?.items[0], isPending: query.isPending, isError: query.isError };
}
