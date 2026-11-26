import type { WishOut } from '@bookeeper/api';
import { Tag } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ListRow } from '../../kit';
import { groupByPerson, priorityKey } from './model';
import styles from './Wishlist.module.css';

const TONES = { low: 'neutral', medium: 'warn', high: 'danger' } as const;

export interface WishRowsProps {
  items: readonly WishOut[];
  family: boolean;
  meId: string | undefined;
  /** Opens the sheet of one of the caller's wishes; absent where nothing can be written. */
  onOpen?: (wish: WishOut) => void;
}

/** The wishes: flat for "La mia", one group per person for "Famiglia". Other people's rows are plain text. */
export function WishRows({ items, family, meId, onOpen }: WishRowsProps) {
  const t = useT();
  const row = (wish: WishOut) => {
    const key = priorityKey(wish.priority);
    const own = wish.user.id === meId;
    return (
      <li key={wish.id}>
        <ListRow
          title={wish.title}
          subtitle={wish.authors ?? undefined}
          trailing={<Tag tone={TONES[key]}>{t(`mwishlist.priority.${key}`)}</Tag>}
          onClick={own && onOpen ? () => onOpen(wish) : undefined}
        />
      </li>
    );
  };

  if (!family) {
    return <ul className={styles.list} aria-label={t('mwishlist.title')}>{items.map(row)}</ul>;
  }
  return (
    <div className={styles.groups}>
      {groupByPerson(items, meId).map((g) => {
        const name = g.userId === meId ? t('mwishlist.family.me') : g.name;
        return (
          <section key={g.userId} className={styles.group} aria-label={name}>
            <h2 className={styles.groupTitle}>{name}</h2>
            <ul className={styles.list}>{g.items.map(row)}</ul>
          </section>
        );
      })}
    </div>
  );
}
