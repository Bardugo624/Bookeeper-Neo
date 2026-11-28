import { useEffect, useRef, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { useSession } from '../../session';
import { ReadingNow } from '../reading';
import { ManageTagsDialog } from '../tags';
import { FirstBookHint, useFirstBook } from '../onboarding';
import { tourExpects, tourNote, tourSignal } from '../tour';
import { BookDialog } from './BookDialog';
import { EbookImportDialog } from './EbookImportDialog';
import { useEbookDrop } from './useEbookDrop';
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
import { useCoverFlight } from './useCoverFlight';
import { useNewBookParam } from './useNewBookParam';
import styles from './BooksPage.module.css';

/** Same mark the celebration leaves (`useFirstBook`), written when the tour has taken its place. */
function markFirstBookSeen(connectionId: string) {
  try {
    localStorage.setItem(`bookeeper.onboarding.firstBook.${connectionId}`, '1');
  } catch {
    // Without storage the celebration may come back: harmless.
  }
}

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
  // The button that opened "New book"; absent when it comes from the palette (`?new=1`).
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  // E-books dropped on the page; `key` makes each drop a fresh dialog.
  const [dropped, setDropped] = useState<{ key: number; files: File[] } | null>(null);
  const drop = useEbookDrop(canWrite, (files) => setDropped((d) => ({ key: (d?.key ?? 0) + 1, files })));
  const connectionId = useSession((s) => s.connection?.id);
  const firstBook = useFirstBook(() => {
    setOrigin(null);
    setAdding(true);
  });
  // Whether the panel was opened on an empty library: the list is already refreshed when a save ends.
  const session = useRef<{ empty: boolean; first: BookOut | null; toured: boolean }>({ empty: false, first: null, toured: false });
  const flight = useCoverFlight();
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

  const openAdd = (from?: HTMLElement | null) => {
    setOrigin(from ?? null);
    session.current = { empty: !query.isPending && !query.isError && items.length === 0 && !filtered, first: null, toured: false };
    setAdding(true);
  };

  useNewBookParam(openAdd, canWrite, permission.role !== null);

  // The celebration comes when the panel closes, if the library went from 0 to 1 or more during its session.
  const closeAdd = () => {
    const { empty, first, toured } = session.current;
    session.current = { empty: false, first: null, toured: false };
    setAdding(false);
    // With the tour guiding, its card takes the celebration's place.
    if (empty && first && !toured) firstBook.celebrate(first);
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
    <div className={drop.over ? `${styles.page} ${styles.dropping}` : styles.page} {...drop.props}>
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
      {!filtered && !query.isPending ? <ReadingNow onAll={() => params.setFilter('reading')} /> : null}
      {body}
      {selecting ? (
        <SelectionBar
          selected={selection.selected}
          books={items.filter((b) => selection.selected.has(b.id))}
          onDone={selection.stop}
        />
      ) : null}
      {canWrite ? <ManageTagsDialog open={managingTags} onClose={() => setManagingTags(false)} /> : null}
      <BookDialog
        open={adding}
        origin={origin}
        onClose={closeAdd}
        onCreated={(created, another, cover) => {
          // The tour tells the person when the cover has landed; asked before the signal moves it on.
          const guiding = tourExpects('book-created');
          tourSignal('book-created', { title: created.title });
          // «First book of the library» only when the library was empty when the panel opened.
          const isFirst = session.current.empty && !session.current.first;
          if (guiding) {
            session.current.toured = true;
            // The tour takes the celebration's place for good: it must not open later.
            if (isFirst && connectionId) markFirstBookSeen(connectionId);
          }
          const landed = () => guiding && isFirst && tourNote({ titleKey: 'tour.firstBook.landed.title', textKey: 'tour.firstBook.landed.text', params: { title: created.title } });
          if (cover && !another) flight.start(created.id, cover, landed);
          else landed();
          // The first book saved in this session of the panel, even when "Save and add another" kept it open.
          if (isFirst) session.current.first = created;
        }}
      />
      {dropped ? <EbookImportDialog key={dropped.key} open files={dropped.files} onClose={() => setDropped(null)} /> : null}
      {drop.over ? (
        <p className={styles.dropHint} aria-hidden="true">
          {t('ebooks.drop')}
        </p>
      ) : null}
      {firstBook.element}
    </div>
  );
}
