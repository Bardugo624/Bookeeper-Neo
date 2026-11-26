import { useCallback } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { useT } from '../../app';
import { useSession } from '../../session';
import { borrowerLabel } from './loanStatus';

/** `borrowerLabel` where the caller reads as "You" (the 6B rule: whoever calls is "Tu"). */
export function useBorrowerLabel(): (loan: Pick<LoanOut, 'borrower' | 'borrower_name'>) => string {
  const t = useT();
  const meId = useSession((s) => s.me?.user.id);
  const label = t('loans.form.me');
  return useCallback((loan) => borrowerLabel(loan, { meId, label }), [meId, label]);
}
