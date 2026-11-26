import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { WishOut } from '@bookeeper/api';
import { Button, EmptyState, Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { useSession } from '../../session';
import { AddWishSheet } from './AddWishSheet';
import { canWriteWishlist, type Scope } from './model';
import { ScopeChoice } from './ScopeChoice';
import { useWishlist } from './useWishlist';
import { WishRows } from './WishRows';
import { WishSheet } from './WishSheet';
import styles from './Wishlist.module.css';

export function WishlistPage() {
  const t = useT();
  const role = useSession((s) => s.me?.user.role);
  const meId = useSession((s) => s.me?.user.id);
  const canWrite = canWriteWishlist(role);
  const [params, setParams] = useSearchParams();
  // A guest has no list of their own: the family's is all there is.
  const scope: Scope = params.get('scope') === 'family' || !canWrite ? 'family' : 'mine';
  const list = useWishlist(scope);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<WishOut | null>(null);

  const choose = (next: Scope) => setParams(next === 'family' ? { scope: 'family' } : {}, { replace: true });
  const items = list.data ?? [];

  let body;
  if (list.isPending) {
    body = (
      <div className={styles.loading} role="status" aria-label={t('mwishlist.loading')}>
        <Spinner label={t('mwishlist.loading')} />
      </div>
    );
  } else if (list.isError) {
    body = <ErrorState message={apiErrorMessage(t, list.error)} onRetry={() => void list.refetch()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="heart"
        title={t(scope === 'mine' ? 'mwishlist.empty.mine.title' : 'mwishlist.empty.family.title')}
        text={t(scope === 'mine' ? 'mwishlist.empty.mine.text' : 'mwishlist.empty.family.text')}
      />
    );
  } else {
    body = <WishRows items={items} family={scope === 'family'} meId={meId} onOpen={canWrite ? setSelected : undefined} />;
  }

  return (
    <Screen
      title={t('mwishlist.title')}
      actions={
        canWrite ? (
          <Button variant="primary" icon="plus" className={styles.addButton} onClick={() => setAdding(true)}>
            {t('mwishlist.add.button')}
          </Button>
        ) : undefined
      }
    >
      <div className={styles.page}>
        {canWrite ? <ScopeChoice value={scope} onChange={choose} /> : null}
        {body}
      </div>
      {adding ? <AddWishSheet onDone={() => setAdding(false)} /> : null}
      {selected ? <WishSheet wish={selected} onClose={() => setSelected(null)} /> : null}
    </Screen>
  );
}
