import { Link } from 'react-router';
import type { LoanOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useLocale, useT } from '../../app/i18n';
import { useCover } from '../search';
import { borrowerLabel, isMember, overdueDays } from './loanModel';
import styles from './Loans.module.css';

export interface LoanRowProps {
  loan: LoanOut;
  /** Seconds since the epoch, to count the days late. */
  now: number;
  /** Present for who may write, on an open loan. */
  onReturn?: (loan: LoanOut) => void;
}

/** Cover, title, who has it and when it is due; tapping opens the book. */
export function LoanRow({ loan, now, onReturn }: LoanRowProps) {
  const t = useT();
  const locale = useLocale();
  const src = useCover(loan.book_id, true);
  const date = (s: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(s * 1000));
  const person = borrowerLabel(loan);
  let when: string;
  if (loan.returned_at != null) when = t('mloans.row.returnedOn', { date: date(loan.returned_at) });
  else if (loan.overdue) when = t('mloans.row.overdue', { count: overdueDays(loan, now) });
  else when = loan.due_at != null ? t('mloans.row.due', { date: date(loan.due_at) }) : t('mloans.row.noDue');
  return (
    <li className={styles.item}>
      <Link to={`/books/${encodeURIComponent(loan.book_id)}`} className={styles.row} aria-label={t('mloans.row.name', { title: loan.book_title, person })}>
        <BookCover title={loan.book_title} src={src} width={48} />
        <span className={styles.text}>
          <span className={styles.title}>{loan.book_title}</span>
          <span className={styles.person}>
            {isMember(loan) ? <Icon name="library" size={16} /> : null}
            <span className={styles.name}>{person}</span>
          </span>
          <span className={loan.overdue && loan.returned_at == null ? styles.late : styles.when}>{when}</span>
        </span>
      </Link>
      {onReturn ? (
        <button type="button" className={styles.button} aria-label={t('mloans.row.returnLabel', { title: loan.book_title })} onClick={() => onReturn(loan)}>
          {t('mloans.row.return')}
        </button>
      ) : null}
    </li>
  );
}
