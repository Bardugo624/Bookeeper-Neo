import type { WishOut } from '@bookeeper/api';
import { useT } from '../../app';
import { WishCard } from './WishCard';
import { groupByPerson, type WishParams } from './listParams';
import type { useWishActions } from './useWishActions';
import styles from './WishlistPage.module.css';

export interface WishItemsProps {
  items: readonly WishOut[];
  family: boolean;
  canWrite: boolean;
  meId: string | undefined;
  view: Pick<WishParams, 'priority' | 'sort'>;
  actions: ReturnType<typeof useWishActions>;
}

/** The cards of the list: flat for "La mia", one group per person for "Famiglia". */
export function WishItems({ items, family, canWrite, meId, view, actions: a }: WishItemsProps) {
  const t = useT();
  const card = (wish: WishOut, own: boolean) => (
    <WishCard
      key={wish.id}
      wish={wish}
      titleLevel={family ? 'h3' : 'h2'}
      actions={
        canWrite && own
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
  );

  if (!family) {
    return (
      <ul className={styles.list} aria-label={t('wishlist.title')}>
        {items.map((w) => card(w, true))}
      </ul>
    );
  }
  return (
    <div className={styles.groups}>
      {groupByPerson(items, meId, view).map((g) => {
        const own = g.userId === meId;
        const name = own ? t('wishlist.family.me') : g.name;
        return (
          <section key={g.userId} className={styles.group} aria-label={name}>
            <h2 className={styles.groupTitle}>{name}</h2>
            <ul className={styles.list}>{g.items.map((w) => card(w, own))}</ul>
          </section>
        );
      })}
    </div>
  );
}
