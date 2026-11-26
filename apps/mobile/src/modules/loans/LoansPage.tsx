import { useState } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { EmptyState, Skeleton, Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage, cx } from '../../kit';
import { useSession } from '../../session';
import { LoanRow } from './LoanRow';
import { ReturnSheet } from './ReturnSheet';
import { canLend, sortActive, sortReturned } from './loanModel';
import { useLoanList, type LoanScope } from './useLoans';
import styles from './Loans.module.css';

const SCOPES: LoanScope[] = ['active', 'returned'];

function Loading() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mloans.list.loading')} className={styles.skeletons}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={84} />
      ))}
    </div>
  );
}

/** "Prestiti": open loans (late ones first) and the returned ones, the latest first. */
export function LoansPage() {
  const t = useT();
  const [scope, setScope] = useState<LoanScope>('active');
  const [returning, setReturning] = useState<LoanOut | null>(null);
  const writer = useSession((s) => canLend(s.me?.user.role));
  const { query, items } = useLoanList(scope);
  const shown = scope === 'active' ? sortActive(items) : sortReturned(items);
  const now = Math.floor(Date.now() / 1000);

  let body;
  if (query.isPending) body = <Loading />;
  else if (query.isError && items.length === 0) {
    body = <ErrorState message={`${t('mloans.list.loadError')} ${apiErrorMessage(t, query.error)}`} onRetry={() => void query.refetch()} />;
  } else if (shown.length === 0) {
    body = <EmptyState icon="loans" title={t(`mloans.empty.${scope}.title`)} text={t(`mloans.empty.${scope}.text`)} />;
  } else {
    body = (
      <>
        <ul className={styles.list} aria-label={t('mloans.list.label')}>
          {shown.map((loan) => (
            <LoanRow key={loan.id} loan={loan} now={now} onReturn={writer && scope === 'active' ? setReturning : undefined} />
          ))}
        </ul>
        {query.hasNextPage ? (
          <button type="button" className={styles.button} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? <Spinner label={t('mloans.list.loading')} /> : t('mloans.list.more')}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <Screen title={t('mloans.title')}>
      <div className={styles.page}>
        <div role="group" aria-label={t('mloans.filters.label')} className={styles.scopes}>
          {SCOPES.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} className={cx(styles.scope, scope === s && styles.on)} onClick={() => setScope(s)}>
              {t(`mloans.filters.${s}`)}
            </button>
          ))}
        </div>
        {body}
      </div>
      {returning ? <ReturnSheet loan={returning} onClose={() => setReturning(null)} /> : null}
    </Screen>
  );
}
