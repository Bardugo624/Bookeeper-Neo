import { Link } from 'react-router';
import type { LoanOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useLocale, useT } from '../../app';
import { StatusTag, formatDate } from '../../kit';
import { STATUS_TONES, authorsOf, bookPath, loanStatus } from './loanStatus';
import { useLoanCover } from './useLoanCover';
import styles from './LoanCard.module.css';

export interface LoanActions {
  edit(loan: LoanOut): void;
  markReturned(loan: LoanOut): void;
  reopen(loan: LoanOut): void;
  remove(loan: LoanOut): void;
}

export interface LoanCardProps {
  loan: LoanOut;
  /** Present only for who may write: without it no action button is drawn. */
  actions?: LoanActions;
  busy?: boolean;
}

export function LoanCard({ loan, actions, busy = false }: LoanCardProps) {
  const t = useT();
  const locale = useLocale();
  const src = useLoanCover(loan.book_id);
  const status = loanStatus(loan);
  const labels = { active: t('loans.status.active'), overdue: t('loans.status.overdue'), returned: t('loans.status.returned') };
  const authors = authorsOf(loan);
  const dates = [
    t('loans.card.since', { date: formatDate(locale, loan.lent_at) }),
    loan.returned_at != null
      ? t('loans.card.returnedOn', { date: formatDate(locale, loan.returned_at) })
      : loan.due_at != null
        ? t('loans.card.due', { date: formatDate(locale, loan.due_at) })
        : t('loans.card.noDue'),
  ];
  return (
    <li className={styles.card} data-status={status}>
      <Link to={bookPath(loan.book_id)} className={styles.cover} aria-label={t('loans.card.openBook', { title: loan.book_title })}>
        <BookCover title={loan.book_title} src={src} width={48} />
      </Link>
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 className={styles.title}>{loan.book_title}</h2>
          <StatusTag status={status} tones={STATUS_TONES} labels={labels} />
        </div>
        {authors ? <p className={styles.authors}>{authors}</p> : null}
        <p className={styles.borrower}>{t('loans.card.to', { name: loan.borrower_name })}</p>
        <p className={styles.dates}>{dates.join(' · ')}</p>
        {loan.notes ? <p className={styles.notes}>{loan.notes}</p> : null}
      </div>
      {actions ? (
        <div className={styles.actions}>
          {status === 'returned' ? (
            <Button size="sm" icon="loans" disabled={busy} onClick={() => actions.reopen(loan)}>
              {t('loans.actions.reopen')}
            </Button>
          ) : (
            <Button size="sm" icon="check" disabled={busy} onClick={() => actions.markReturned(loan)}>
              {t('loans.actions.return')}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="pencil" disabled={busy} onClick={() => actions.edit(loan)}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="ghost" icon="trash" disabled={busy} onClick={() => actions.remove(loan)}>
            {t('common.delete')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
