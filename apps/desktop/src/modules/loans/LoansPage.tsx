import { Button, EmptyState } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { PageHeader, usePermission } from '../../kit';
import { LoanDialogs } from './LoanDialogs';
import { LoanList, LoanSkeleton } from './LoanList';
import { FILTERS, useLoanParams, type LoanFilter } from './listParams';
import { useLoanDialogs } from './useLoanDialogs';
import { useLoanCounts, useLoanList } from './useLoans';
import styles from './LoansPage.module.css';

export function LoansPage() {
  const t = useT();
  const { can } = usePermission();
  const writable = can('write');
  const params = useLoanParams();
  const { filter, book } = params.values;
  const { query, items } = useLoanList(filter, book);
  const counts = useLoanCounts(book);
  const dialogs = useLoanDialogs();

  const tabs: PillTabItem[] = FILTERS.map((id) => ({ id, label: t(`loans.filters.${id}`) }));
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
    body = <EmptyState icon="loans" title={t(`loans.empty.${filter}.title`)} text={t(`loans.empty.${filter}.text`)} />;
  } else {
    body = (
      <>
        <LoanList
          loans={items}
          label={t('loans.list.label')}
          actions={writable ? dialogs.actions : undefined}
          busyId={dialogs.busyId}
        />
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
        value={filter}
        label={t('loans.filters.label')}
        onChange={(id) => {
          dialogs.dismissError();
          params.set({ filter: id as LoanFilter });
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
