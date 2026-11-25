import { useEffect, useRef, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { ManageTagsDialog } from '../tags';
import { FirstBookHint, useFirstBook } from '../onboarding';
import { BookDrawer } from './BookDrawer';
import { BookGrid, GridSkeleton } from './BookGrid';
import { BookTable, TableSkeleton } from './BookTable';
import { BooksHeader } from './BooksHeader';
import { FilterBar } from './FilterBar';
import { NoResults } from './NoResults';
import { SelectionBar } from './SelectionBar';
import { useSelection } from './useSelection';
import { useListParams } from './listParams';
import { useActiveFilters } from './useActiveFilters';
import { useBookList, useEndReached, useOnLoanCount } from './useBookList';
import { useNewBookParam } from './useNewBookParam';
import styles from './BooksPage.module.css';

export function BooksPage() {
  const t = useT();
  const params = useListParams();
  const { query, items, total } = useBookList(params);
  const onLoan = useOnLoanCount();
  const more = query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;
  const sentinel = useEndReached(() => void query.fetchNextPage(), more, items.length);
  const permission = usePermission();
  const canWrite = permission.can('write');
  const active = useActiveFilters(params.filters);
  const [adding, setAdding] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const firstBook = useFirstBook(() => setAdding(true));
  // Whether the panel was opened on an empty library: the list is already refreshed when a save ends.
  const session = useRef<{ empty: boolean; first: BookOut | null }>({ empty: false, first: null });
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
  const filtered = params.q.trim() !== '' || active.length > 0;
  const noResults = filtered && !query.isPending && !query.isError && items.length === 0;

  const openAdd = () => {
    session.current = { empty: !query.isPending && !query.isError && items.length === 0 && !filtered, first: null };
    setAdding(true);
  };

  useNewBookParam(openAdd, canWrite, permission.role !== null);

  // The celebration comes when the panel closes, if the library went from 0 to 1 or more during its session.
  const closeAdd = () => {
    const { empty, first } = session.current;
    session.current = { empty: false, first: null };
    setAdding(false);
    if (empty && first) firstBook.celebrate(first);
  };

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
      <NoResults
        items={[
          ...(params.q.trim() ? [{ id: 'q', label: t('books.active.q', { q: params.q.trim() }), remove: () => params.setQuery('') }] : []),
          ...active.map((a) => ({ id: a.id, label: a.label, remove: () => params.setFilters(a.without) })),
        ]}
        onReset={params.reset}
      />
    ) : canWrite ? (
      <FirstBookHint onAdd={openAdd} />
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
                onAdd: openAdd,
                onToggleSelect: () => (selecting ? selection.stop() : selection.start()),
                onManageTags: () => setManagingTags(true),
              }
            : undefined
        }
      />
      <FilterBar params={params} active={active} hideActive={noResults} />
      {body}
      {selecting ? (
        <SelectionBar
          selected={selection.selected}
          books={items.filter((b) => selection.selected.has(b.id))}
          onDone={selection.stop}
        />
      ) : null}
      {canWrite ? <ManageTagsDialog open={managingTags} onClose={() => setManagingTags(false)} /> : null}
      <BookDrawer
        open={adding}
        onClose={closeAdd}
        onCreated={(created) => {
          // The first book saved in this session of the panel, even when "Save and add another" kept it open.
          if (session.current.empty && !session.current.first) session.current.first = created;
        }}
      />
      {firstBook.element}
    </div>
  );
}
