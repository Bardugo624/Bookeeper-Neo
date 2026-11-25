import { useEffect, useState } from 'react';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { BookDrawer } from './BookDrawer';
import { BookGrid, GridSkeleton } from './BookGrid';
import { BookTable, TableSkeleton } from './BookTable';
import { BooksHeader } from './BooksHeader';
import { SelectionBar } from './SelectionBar';
import { useSelection } from './useSelection';
import type { Filter } from './listParams';
import { useListParams } from './listParams';
import { useBookList, useEndReached, useOnLoanCount } from './useBookList';
import styles from './BooksPage.module.css';

export function BooksPage() {
  const t = useT();
  const params = useListParams();
  const { query, items, total } = useBookList(params);
  const onLoan = useOnLoanCount();
  const more = query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;
  const sentinel = useEndReached(() => void query.fetchNextPage(), more, items.length);
  const canWrite = usePermission().can('write');
  const [adding, setAdding] = useState(false);
  const selection = useSelection(items.map((b) => b.id));
  const selecting = canWrite && selection.active;
  const { selectAll } = selection;
  useEffect(() => {
    if (!selecting) return;
    // Ctrl A (Cmd A) selects every loaded book, unless the user is typing.
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.getAttribute('type') !== 'checkbox';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        selectAll();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting, selectAll]);
  const picking = selecting ? selection : undefined;
  const filtered = params.q.trim() !== '' || params.filter !== 'all';

  const filters: PillTabItem[] = [
    { id: 'all', label: t('books.filters.all') },
    { id: 'loan', label: t('books.filters.loan') },
    { id: 'unshelved', label: t('books.filters.unshelved') },
  ];

  let body;
  if (query.isPending) {
    body = params.view === 'list' ? (
      <TableSkeleton label={t('books.list.loading')} />
    ) : (
      <GridSkeleton count={12} label={t('books.list.loading')} />
    );
  } else if (query.isError && items.length === 0) {
    body = (
      <EmptyState
        icon="alert"
        title={t('books.error.title')}
        text={t('books.error.text')}
        action={<Button onClick={() => void query.refetch()}>{t('books.error.retry')}</Button>}
      />
    );
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        icon="search"
        title={t('books.noResults.title')}
        text={t('books.noResults.text')}
        action={<Button onClick={params.reset}>{t('books.noResults.reset')}</Button>}
      />
    ) : (
      <EmptyState icon="book" title={t('books.empty.title')} text={t('books.empty.text')} />
    );
  } else {
    const loadingMore = query.isFetchingNextPage;
    body = (
      <>
        {params.view === 'list' ? (
          <BookTable books={items} params={params} loadingMore={loadingMore} selection={picking} />
        ) : (
          <BookGrid books={items} from={params.search} loadingMore={loadingMore} selection={picking} />
        )}
        {query.isFetchNextPageError ? (
          <div className={styles.moreError} role="alert">
            <span>{t('books.error.moreText')}</span>
            <Button onClick={() => void query.fetchNextPage()}>{t('books.error.retry')}</Button>
          </div>
        ) : null}
        {query.hasNextPage ? <div ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <BooksHeader
        params={params}
        total={total}
        onLoan={onLoan}
        actions={
          canWrite
            ? {
                selecting,
                onAdd: () => setAdding(true),
                onToggleSelect: () => (selecting ? selection.stop() : selection.start()),
              }
            : undefined
        }
      />
      <PillTabs
        items={filters}
        value={params.filter}
        onChange={(id) => params.setFilter(id as Filter)}
        label={t('books.filters.label')}
      />
      {body}
      {selecting ? <SelectionBar selected={selection.selected} onDone={selection.stop} /> : null}
      <BookDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
