import { useEffect, useRef, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { ManageTagsDialog } from '../tags';
import { FirstBookHint, useFirstBook } from '../onboarding';
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
  const filtered = params.q.trim() !== '' || params.filter !== 'all' || params.tag !== null;

  const filters: PillTabItem[] = [
    { id: 'all', label: t('books.filters.all') },
    { id: 'to_read', label: t('books.filters.to_read') },
    { id: 'reading', label: t('books.filters.reading') },
    { id: 'read', label: t('books.filters.read') },
    { id: 'loan', label: t('books.filters.loan') },
    { id: 'unshelved', label: t('books.filters.unshelved') },
  ];

  const openAdd = () => {
    session.current = { empty: !query.isPending && !query.isError && items.length === 0 && !filtered, first: null };
    setAdding(true);
  };

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
      <EmptyState
        icon="search"
        title={t('books.noResults.title')}
        text={t('books.noResults.text')}
        action={<Button onClick={params.reset}>{t('books.noResults.reset')}</Button>}
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
      <PillTabs
        items={filters}
        value={params.filter}
        onChange={(id) => params.setFilter(id as Filter)}
        label={t('books.filters.label')}
      />
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
