import { useEffect } from 'react';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { PageHeader, usePermission } from '../../kit';
import { LoanDialogs } from './LoanDialogs';
import { LoanHistory } from './LoanHistory';
import { LoanList, LoanSkeleton } from './LoanList';
import { sameName } from './history';
import { borrowerLabel } from './loanStatus';
import { FILTERS, useLoanParams, type LoanFilter } from './listParams';
import { useLoanDialogs } from './useLoanDialogs';
import { useHasLoansToMe, useLoanCounts, useLoanList } from './useLoans';
import styles from './LoansPage.module.css';

export function LoansPage() {
  const t = useT();
  const { can } = usePermission();
  const writable = can('write');
  const params = useLoanParams();
  const { filter, book, borrower } = params.values;
  const mine = params.values.mine === '1';
  const hasMine = useHasLoansToMe();
  const history = filter === 'returned';
  const { query, items: loaded } = useLoanList(filter, book, history || borrower !== '' || mine, mine);
  const items = borrower ? loaded.filter((l) => sameName(borrowerLabel(l)) === sameName(borrower)) : loaded;
  const allCounts = useLoanCounts(book);
  // Totals ignore the person filter, so they are left out while it is on.
  const counts = borrower || mine ? { active: undefined, overdue: undefined } : allCounts;
  const dialogs = useLoanDialogs();
  const openNew = dialogs.open;
  const wantsNew = params.values.new === '1';
  const setParams = params.set;
  useEffect(() => {
    if (!wantsNew) return;
    if (writable) openNew({ kind: 'new' });
    setParams({ new: '' });
  }, [wantsNew, writable, openNew, setParams]);
  const byBorrower = (name: string) => params.set({ borrower: name, filter: 'all', mine: '' });

  const tabs: PillTabItem[] = FILTERS.map((id) => ({ id, label: t(`loans.filters.${id}`) }));
  if (hasMine || mine) tabs.push({ id: 'mine', label: t('loans.filters.mine') });
  const parts = [
    counts.active === undefined ? null : t('loans.count.active', { count: counts.active }),
    counts.overdue === undefined ? null : t('loans.count.overdue', { count: counts.overdue }),
  ].filter(Boolean);

  let body;
  if (query.isPending) {
    body = <LoanSkeleton label={t('loans.list.loading')} />;
  } else if (query.isError && items.length === 0) {
    body = (
      <EmptyState
        icon="alert"
        title={t('loans.error.title')}
        text={t('loans.error.text')}
        action={<Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
      />
    );
  } else if (items.length === 0) {
    const key = mine ? 'mine' : filter;
    // Every empty list says what it is for and offers the next step: lend a book, or look where the loans are.
    const next =
      key === 'active' || key === 'all' ? (
        writable ? (
          <Button variant="primary" icon="plus" onClick={() => dialogs.open({ kind: 'new' })}>
            {t('loans.new.button')}
          </Button>
        ) : undefined
      ) : (
        <Button onClick={() => params.pickFilter('active')}>{t(`loans.empty.${key}.action`)}</Button>
      );
    body = <EmptyState icon="loans" title={t(`loans.empty.${key}.title`)} text={t(`loans.empty.${key}.text`)} action={next} />;
  } else {
    const actions = writable ? dialogs.actions : undefined;
    body = (
      <>
        {history ? (
          <LoanHistory loans={items} actions={actions} busyId={dialogs.busyId} onBorrower={byBorrower} />
        ) : (
          <LoanList
            loans={items}
            label={t('loans.list.label')}
            actions={actions}
            busyId={dialogs.busyId}
            onBorrower={byBorrower}
          />
        )}
        {query.hasNextPage ? (
          <Button
            className={styles.more}
            loading={query.isFetchingNextPage}
            loadingLabel={t('loans.list.loadingMore')}
            onClick={() => void query.fetchNextPage()}
          >
            {t('loans.list.more')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('loans.title')}
        count={parts.join(' · ')}
        actions={
          writable ? (
            <Button variant="primary" icon="plus" onClick={() => dialogs.open({ kind: 'new' })}>
              {t('loans.new.button')}
            </Button>
          ) : undefined
        }
      />
      <PillTabs
        items={tabs}
        value={mine ? 'mine' : filter}
        label={t('loans.filters.label')}
        onChange={(id) => {
          dialogs.dismissError();
          params.pickFilter(id as LoanFilter | 'mine');
        }}
      />
      {book ? (
        <p className={styles.bookFilter}>
          <span>{t('loans.bookFilter.text')}</span>
          <Button size="sm" variant="ghost" onClick={() => params.set({ book: '' })}>
            {t('loans.bookFilter.clear')}
          </Button>
        </p>
      ) : null}
      {borrower ? (
        <p className={styles.bookFilter}>
          <span>{t('loans.borrowerFilter.text', { name: borrower })}</span>
          <Button size="sm" variant="ghost" onClick={() => params.set({ borrower: '' })}>
            {t('loans.borrowerFilter.clear')}
          </Button>
        </p>
      ) : null}
      {dialogs.error ? (
        <p role="alert" className={styles.error}>
          {dialogs.error}
        </p>
      ) : null}
      {body}
      <LoanDialogs
        dialog={dialogs.dialog}
        deleting={dialogs.deleting}
        onClose={dialogs.close}
        onConfirmDelete={dialogs.confirmDelete}
      />
    </div>
  );
}
