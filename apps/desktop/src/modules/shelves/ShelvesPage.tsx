import { useNavigate } from 'react-router';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, PageHeader } from '../../kit';
import { PlaceDialog } from './PlaceDialog';
import { ShelfCabinet } from './ShelfCabinet';
import { ShelfFormDialog } from './ShelfFormDialog';
import { ShelfPanel } from './ShelfPanel';
import { SpineMenu } from './SpineMenu';
import { UnshelvedList } from './UnshelvedList';
import { colorOf } from './model';
import { useShelvesView } from './useShelvesView';
import styles from './ShelvesPage.module.css';

export function ShelvesPage() {
  const t = useT();
  const v = useShelvesView();
  const { shelf, shelves, canWrite, dialog } = v;
  const navigate = useNavigate();
  const create = () => v.setDialog({ kind: 'form' });
  const newButton = canWrite ? (
    <Button variant="primary" icon="plus" onClick={create}>
      {t('shelves.new')}
    </Button>
  ) : undefined;

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
  } else if (!shelf) {
    body = (
      <EmptyState
        icon="library"
        title={t('shelves.empty.title')}
        text={t('shelves.empty.text')}
        action={
          canWrite ? (
            <Button variant="primary" icon="plus" onClick={create}>
              {t('shelves.empty.create')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <PillTabs
          label={t('shelves.tabs')}
          value={shelf.id}
          onChange={(unit) => v.params.set({ unit, book: '' })}
          items={shelves.map((s) => ({ id: s.id, label: s.name, dot: colorOf(s.color) }))}
        />
        <div className={styles.layout}>
          <div className={styles.main}>
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
              onPlace={canWrite ? (book) => v.setDialog({ kind: 'place', book }) : null}
            />
          </ShelfPanel>
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
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
      {body}
      {dialog?.kind === 'form' ? (
        <ShelfFormDialog
          key={dialog.shelf?.id ?? 'new'}
          shelf={dialog.shelf}
          save={(values) => v.save(dialog.shelf, values)}
          onClose={() => v.setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'place' && shelf ? (
        <PlaceDialog
          book={dialog.book}
          shelves={shelves}
          initialShelfId={shelf.id}
          busy={v.placing}
          onPlace={(target, books, row) => void v.placeAtEnd(dialog.book, target, books, row)}
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
        onClose={() => v.setSpine(null)}
      />
    </div>
  );
}
