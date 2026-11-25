import { useState } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import type { LoanActions } from './LoanCard';
import { useLoanMutations } from './useLoanMutations';

export type LoanDialog =
  | { kind: 'new' }
  | { kind: 'edit'; loan: LoanOut }
  | { kind: 'return'; loan: LoanOut }
  | { kind: 'delete'; loan: LoanOut };

/** Which dialog is open, the actions the cards trigger, and the error of the last direct action. */
export function useLoanDialogs() {
  const t = useT();
  const { reopen, remove } = useLoanMutations();
  const [dialog, setDialog] = useState<LoanDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setDialog(null);

  const actions: LoanActions = {
    edit: (loan) => setDialog({ kind: 'edit', loan }),
    markReturned: (loan) => setDialog({ kind: 'return', loan }),
    remove: (loan) => setDialog({ kind: 'delete', loan }),
    reopen(loan) {
      setError(null);
      reopen.mutate(loan.id, {
        onError: (e) => setError(apiErrorMessage(t, e, { book_already_lent: t('loans.errors.reopenLent') })),
      });
    },
  };

  const confirmDelete = (loan: LoanOut) => {
    setError(null);
    remove.mutate(loan.id, {
      onSuccess: close,
      onError: (e) => {
        setError(apiErrorMessage(t, e));
        close();
      },
    });
  };

  return {
    dialog,
    open: setDialog,
    close,
    actions,
    error,
    dismissError: () => setError(null),
    deleting: remove.isPending,
    confirmDelete,
    busyId: reopen.isPending ? reopen.variables : undefined,
  };
}
