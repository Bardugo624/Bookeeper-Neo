import { useState } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { BottomSheet, apiErrorMessage } from '../../kit';
import { borrowerLabel } from './loanModel';
import { useReturnLoan } from './useLoans';
import styles from './Loans.module.css';

/** "Return the book?": nothing is sent until the confirm button. */
export function ReturnSheet({ loan, onClose }: { loan: LoanOut; onClose: () => void }) {
  const t = useT();
  const ret = useReturnLoan();
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (ret.isPending) return;
    setError(null);
    try {
      await ret.mutateAsync(loan.id);
      onClose();
    } catch (e) {
      setError(`${t('mloans.return.failed')} ${apiErrorMessage(t, e)}`);
    }
  };
  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('mloans.return.title')}
      description={t('mloans.return.text', { title: loan.book_title, person: borrowerLabel(loan) })}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.primary} disabled={ret.isPending} onClick={() => void confirm()}>
            {t('mloans.return.confirm')}
          </button>
          <button type="button" className={styles.button} disabled={ret.isPending} onClick={onClose}>
            {t('mloans.return.cancel')}
          </button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </BottomSheet>
  );
}
