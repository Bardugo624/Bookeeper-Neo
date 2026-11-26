import { useCallback } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { useT } from '../../app';
import { useSession } from '../../session';
import { borrowerLabel } from './loanStatus';

/**
 * `borrowerLabel` where the caller reads as "You" (the 6B rule: whoever calls is "Tu").
 * `asObject` gives the form that follows a preposition ("A te", "to you").
 */
export function useBorrowerLabel(): (
  loan: Pick<LoanOut, 'borrower' | 'borrower_name'>,
  asObject?: boolean,
) => string {
  const t = useT();
  const meId = useSession((s) => s.me?.user.id);
  const subject = t('loans.form.me');
  const object = t('loans.form.meObject');
  return useCallback(
    (loan, asObject = false) => borrowerLabel(loan, { meId, label: asObject ? object : subject }),
    [meId, subject, object],
  );
}
