import type { LoanOut } from '@bookeeper/api';
import { Skeleton } from '@bookeeper/ui/base';
import { LoanCard, type LoanActions } from './LoanCard';
import styles from './LoanList.module.css';

export interface LoanListProps {
  loans: LoanOut[];
  label: string;
  actions?: LoanActions;
  busyId?: string;
  onBorrower?(name: string): void;
  /** Extra line for a loan, by id. */
  extras?: Record<string, string>;
}

export function LoanList({ loans, label, actions, busyId, onBorrower, extras }: LoanListProps) {
  return (
    <ul className={styles.list} aria-label={label}>
      {loans.map((loan) => (
        <LoanCard key={loan.id} loan={loan} actions={actions} busy={busyId === loan.id} onBorrower={onBorrower} extra={extras?.[loan.id]} />
      ))}
    </ul>
  );
}

export function LoanSkeleton({ label }: { label: string }) {
  return (
    <ul className={styles.list} aria-label={label} aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className={styles.skeleton}>
          <Skeleton width={48} height={72} />
          <div className={styles.lines}>
            <Skeleton shape="line" width={220} />
            <Skeleton shape="line" width={140} />
            <Skeleton shape="line" width={180} />
          </div>
        </li>
      ))}
    </ul>
  );
}
