import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { useSession } from '../../session';
import { LendSheet } from './LendSheet';
import { ReturnSheet } from './ReturnSheet';
import { borrowerLabel, canLend } from './loanModel';
import { useBookLoan } from './useLoans';
import styles from './Loans.module.css';

/** "Lend" on a free book, "Return" on a lent one; nothing for who may not write. */
export function LoanActions({ book }: { book: Pick<BookOut, 'id' | 'title' | 'on_loan'> }) {
  const t = useT();
  const writer = useSession((s) => canLend(s.me?.user.role));
  const [sheet, setSheet] = useState<'lend' | 'return' | null>(null);
  const { loan, isError } = useBookLoan(book.id, writer && book.on_loan);
  if (!writer) return null;
  const close = () => setSheet(null);
  return (
    <>
      {book.on_loan && loan ? <p className={styles.plain}>{t('mloans.block.to', { person: borrowerLabel(loan) })}</p> : null}
      {book.on_loan && isError ? <p className={styles.error}>{t('mloans.block.loadError')}</p> : null}
      {!book.on_loan || loan ? (
        <button type="button" className={styles.button} onClick={() => setSheet(book.on_loan ? 'return' : 'lend')}>
          {book.on_loan ? t('mloans.block.return') : t('mloans.block.lend')}
        </button>
      ) : null}
      {sheet === 'lend' ? <LendSheet book={book} onDone={close} /> : null}
      {sheet === 'return' && loan ? <ReturnSheet loan={loan} onClose={close} /> : null}
    </>
  );
}
