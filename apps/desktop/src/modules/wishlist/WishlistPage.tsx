import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, PageHeader, useListParams, usePermission } from '../../kit';
import { ConvertedNotice } from './ConvertedNotice';
import { WishCard } from './WishCard';
import { WishFormDialog } from './WishFormDialog';
import { PARAM_SCHEMA, applyView, type WishParams } from './listParams';
import { useWishActions } from './useWishActions';
import { useWishlist } from './useWishlist';
import styles from './WishlistPage.module.css';

export function WishlistPage() {
  const t = useT();
  const { can } = usePermission();
  const canWrite = can('write');
  const params = useListParams<WishParams>(PARAM_SCHEMA);
  const { query } = useWishlist();
  const a = useWishActions();
  const all = query.data?.items ?? [];
  const items = applyView(all, params.values);

  const filters: PillTabItem[] = [
    { id: 'all', label: t('wishlist.filters.all') },
    { id: '2', label: t('wishlist.priority.high') },
    { id: '1', label: t('wishlist.priority.medium') },
    { id: '0', label: t('wishlist.priority.low') },
  ];
  const sorts: PillTabItem[] = [
    { id: 'priority', label: t('wishlist.sort.priority') },
    { id: 'date', label: t('wishlist.sort.date') },
  ];

  let body;
  if (query.isPending) {
    body = (
      <div role="status" aria-label={t('wishlist.loading')} className={styles.list}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={110} />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <EmptyState
        icon="alert"
        title={t('wishlist.error.title')}
        text={t('wishlist.error.text')}
        action={<Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
      />
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon="heart"
        title={t('wishlist.empty.title')}
        text={t('wishlist.empty.text')}
        action={canWrite ? <Button variant="primary" icon="plus" onClick={() => a.setDialog({ kind: 'form' })}>{t('wishlist.add')}</Button> : undefined}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title={t('wishlist.noResults.title')}
        text={t('wishlist.noResults.text')}
        action={<Button onClick={params.reset}>{t('wishlist.noResults.reset')}</Button>}
      />
    );
  } else {
    body = (
      <ul className={styles.list} aria-label={t('wishlist.title')}>
        {items.map((wish) => (
          <WishCard
            key={wish.id}
            wish={wish}
            actions={
              canWrite
                ? {
                    onEdit: () => a.setDialog({ kind: 'form', wish }),
                    onDelete: () => a.setDialog({ kind: 'delete', wish }),
                    onConvert: () => void a.convertWish(wish),
                    converting: a.convertingId === wish.id,
                    locked: a.convertingId !== undefined,
                  }
                : null
            }
          />
        ))}
      </ul>
    );
  }

  const dialog = a.dialog;
  return (
    <div className={styles.page}>
      <PageHeader
        title={t('wishlist.title')}
        count={query.data ? t('wishlist.count', { count: all.length }) : undefined}
        actions={canWrite ? <Button variant="primary" icon="plus" onClick={() => a.setDialog({ kind: 'form' })}>{t('wishlist.add')}</Button> : undefined}
      />
      {all.length > 0 ? (
        <div className={styles.tools}>
          <PillTabs items={filters} value={params.values.priority} onChange={(id) => params.set({ priority: id as WishParams['priority'] })} label={t('wishlist.filters.label')} />
          <PillTabs items={sorts} value={params.values.sort} onChange={(id) => params.set({ sort: id as WishParams['sort'] })} variant="segmented" size="sm" label={t('wishlist.sort.label')} />
        </div>
      ) : null}
      {a.error ? (
        <p role="alert" className={styles.error}>
          {a.error}
        </p>
      ) : null}
      {body}
      {dialog?.kind === 'form' ? (
        <WishFormDialog key={dialog.wish?.id ?? 'new'} wish={dialog.wish} save={(v) => a.save(dialog.wish, v)} onClose={() => a.setDialog(null)} />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('wishlist.delete.title')}
        description={t('wishlist.delete.description', { title: dialog?.kind === 'delete' ? dialog.wish.title : '' })}
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={a.deleting}
        onConfirm={() => dialog?.kind === 'delete' && void a.confirmDelete(dialog.wish)}
        onCancel={() => a.setDialog(null)}
      />
      {a.converted ? <ConvertedNotice bookId={a.converted.bookId} title={a.converted.title} onDismiss={a.dismissConverted} /> : null}
    </div>
  );
}
