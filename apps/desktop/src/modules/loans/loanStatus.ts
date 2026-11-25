import type { LoanOut } from '@bookeeper/api';
import type { TagProps } from '@bookeeper/ui/base';

export type LoanStatus = 'active' | 'overdue' | 'returned';

/**
 * The single place that turns a loan into a status. The core already computes `overdue`
 * (open loan whose due date is in the past), so nothing is derived from the clock here.
 */
export function loanStatus(loan: Pick<LoanOut, 'returned_at' | 'overdue'>): LoanStatus {
  if (loan.returned_at != null) return 'returned';
  return loan.overdue ? 'overdue' : 'active';
}

export const STATUS_TONES: Record<LoanStatus, NonNullable<TagProps['tone']>> = {
  active: 'primary',
  overdue: 'danger',
  returned: 'ok',
};

export function authorsOf(loan: Pick<LoanOut, 'book_authors'>): string {
  return loan.book_authors.join(', ');
}

export function bookPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}`;
}
