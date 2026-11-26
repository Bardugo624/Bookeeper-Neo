import { useNavigate } from 'react-router';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { ConfirmDialog, PageHeader } from '../../kit';
import { tourAnchor } from '../tour';
import { PlaceDialog } from './PlaceDialog';
import { RoomsDialog } from './RoomsDialog';
import { ShelfCabinet } from './ShelfCabinet';
import { ShelfFormDialog } from './ShelfFormDialog';
import { ShelfPanel } from './ShelfPanel';
import { ShelfTabs } from './ShelfTabs';
import { SpineMenu } from './SpineMenu';
import { WhereBar } from './WhereBar';
import { UnshelvedList } from './UnshelvedList';
import { roomOf } from './roomModel';
import { useShelvesView } from './useShelvesView';
import styles from './ShelvesPage.module.css';

export function ShelvesPage() {
  const t = useT();
  const v = useShelvesView();
  const { shelf, shelves, all, canWrite, dialog } = v;
  const navigate = useNavigate();
  const unplacedBook = v.where?.kind === 'unplaced' ? v.where.book : null;
  const create = () => v.setDialog({ kind: 'form' });
  const newButton = canWrite ? (
    <>
      <Button onClick={() => v.setDialog({ kind: 'rooms' })}>{t('shelves.rooms.manage')}</Button>
      <Button {...(v.list.data && all.length === 0 ? tourAnchor('shelves.new') : {})} variant="primary" icon="plus" onClick={create}>
        {t('shelves.new')}
      </Button>
    </>
  ) : undefined;
  const filtered = Boolean(v.params.values.room);
  const filterName = v.rooms.find((r) => r.id === v.params.values.room)?.name ?? null;
  const clearFilter = () => v.params.set({ room: '', unit: '', book: '' });

  let body;
  if (v.list.isPending) {
    body = (
      <div role="status" aria-label={t('shelves.loading')} className={styles.layout}>
        <Skeleton height={420} />
        <Skeleton height={420} />
      </div>
    );
  } else if (v.list.isError) {
    body = (
      <EmptyState
        icon="alert"
        title={t('shelves.error.title')}
        text={t('shelves.error.text')}
        action={<Button onClick={() => void v.list.refetch()}>{t('common.retry')}</Button>}
      />
    );
  } else if (!shelf && filtered) {
    body = (
      <EmptyState
        icon="library"
        title={t('shelves.rooms.filterEmpty.title')}
        text={t('shelves.rooms.filterEmpty.text')}
        action={<Button onClick={clearFilter}>{t('shelves.rooms.showAll')}</Button>}
      />
    );
  } else if (!shelf) {
    body = (
      <EmptyState
        icon="library"
        title={t('shelves.empty.title')}
        text={t(canWrite ? 'shelves.empty.text' : 'shelves.empty.textReadOnly')}
        action={
          canWrite ? (
            <Button {...tourAnchor('shelves.new')} variant="primary" icon="plus" onClick={create}>
              {t('shelves.empty.create')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <ShelfTabs
          groups={v.groups}
          value={shelf.id}
          onChange={(unit) => v.params.set({ unit, book: '' })}
          onDropBook={canWrite ? (bookId, unit) => void v.dropOnTab(bookId, unit) : null}
        />
        <div className={styles.layout}>
          <div className={styles.main}>
            <WhereBar
              state={v.where}
              shelf={shelf}
              blocked={dialog !== null || v.spine !== null}
              onDone={v.doneWhere}
              onPlace={canWrite && unplacedBook ? () => v.setDialog({ kind: 'place', book: unplacedBook, fresh: unplacedBook }) : null}
            />
            {v.books.isPending ? (
              <div role="status" aria-label={t('shelves.loadingBooks')}>
                <Skeleton height={380} />
              </div>
            ) : v.books.isError ? (
              <EmptyState
                icon="alert"
                title={t('shelves.booksError.title')}
                text={t('shelves.booksError.text')}
                action={<Button onClick={() => void v.books.refetch()}>{t('common.retry')}</Button>}
              />
            ) : (
              <ShelfCabinet
                shelf={shelf}
                pulledId={v.where?.kind === 'here' ? v.where.bookId : undefined}
                books={v.books.data.items}
                selectedId={v.params.values.book || undefined}
                canWrite={canWrite}
                onDrop={v.drop}
                onSpine={v.setSpine}
              />
            )}
          </div>
          <ShelfPanel
            shelf={shelf}
            roomName={roomOf(shelf, v.rooms)?.name ?? null}
            onEdit={canWrite ? () => v.setDialog({ kind: 'form', shelf }) : null}
            onDelete={canWrite ? () => v.setDialog({ kind: 'delete', shelf }) : null}
          >
            <UnshelvedList
              items={v.unshelved.data?.items}
              total={v.unshelved.data?.total}
              loading={v.unshelved.isPending}
              failed={v.unshelved.isError}
              q={v.search}
              onQ={v.setSearch}
              onRetry={() => void v.unshelved.refetch()}
              onPlace={canWrite ? (book) => v.setDialog({ kind: 'place', book, fresh: book }) : null}
            />
          </ShelfPanel>
        </div>
      </>
    );
  }

  return (
    <div className={styles.page} {...tourAnchor('shelves.page')}>
      <PageHeader
        title={t('shelves.title')}
        count={
          v.list.data
            ? `${t('shelves.count.units', { count: shelves.length })} · ${t('shelves.count.placed', { count: v.placed })}`
            : undefined
        }
        actions={newButton}
      />
      {v.error ? (
        <p role="alert" className={styles.error}>
          {v.error}
        </p>
      ) : null}
      {filtered && filterName !== null ? (
        <p className={styles.filterNote}>
          {t('shelves.rooms.filter', { name: filterName })}
          <Button variant="ghost" size="sm" onClick={clearFilter}>
            {t('shelves.rooms.showAll')}
          </Button>
        </p>
      ) : null}
      {body}
      {dialog?.kind === 'form' ? (
        <ShelfFormDialog
          key={dialog.shelf?.id ?? 'new'}
          shelf={dialog.shelf}
          rooms={v.rooms}
          save={(values) => v.save(dialog.shelf, values)}
          onClose={() => v.setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'place' && shelf ? (
        <PlaceDialog
          book={dialog.book}
          shelves={v.all}
          initialShelfId={shelf.id}
          initialRow={dialog.row}
          busy={v.placing}
          onPlace={(target, books, row) => void v.placeAtEnd(dialog, target, books, row)}
          onClose={() => v.setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'rooms' ? (
        <RoomsDialog
          rooms={v.rooms}
          onDeleted={(id) => v.params.values.room === id && v.params.set({ room: '' })}
          onClose={() => v.setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('shelves.delete.title')}
        description={
          dialog?.kind === 'delete'
            ? t(dialog.shelf.book_count > 0 ? 'shelves.delete.withBooks' : 'shelves.delete.empty', {
                name: dialog.shelf.name,
                count: dialog.shelf.book_count,
              })
            : ''
        }
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={v.deleting}
        onConfirm={() => dialog?.kind === 'delete' && void v.confirmDelete(dialog.shelf)}
        onCancel={() => v.setDialog(null)}
      />
      <SpineMenu
        book={v.spine}
        onRemove={canWrite ? (book) => void v.removeFromShelf(book) : null}
        onMove={canWrite ? v.moveSpine : null}
        width={v.spine ? v.widthOf(v.spine.id) : null}
        onWidth={canWrite ? v.setWidth : null}
        onClose={() => v.setSpine(null)}
      />
    </div>
  );
}
