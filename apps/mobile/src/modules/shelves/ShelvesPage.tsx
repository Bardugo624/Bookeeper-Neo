import { Link } from 'react-router';
import { EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { groupByRoom, useShelfList } from './useShelfList';
import styles from './Shelves.module.css';

function Body() {
  const t = useT();
  const list = useShelfList();
  if (list.isError) return <ErrorState message={apiErrorMessage(t, list.error)} onRetry={() => void list.refetch()} />;
  if (!list.data) {
    return (
      <div role="status" aria-label={t('mobile.loading')} className={styles.page}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (list.data.items.length === 0) return <EmptyState icon="library" title={t('mshelves.empty.title')} text={t('mshelves.empty.text')} />;
  return (
    <div className={styles.page}>
      {groupByRoom(list.data.items).map((g) => {
        const name = g.room?.name ?? t('mshelves.noRoom');
        return (
          <section key={g.room?.id ?? 'none'} aria-label={name} className={styles.room}>
            <h2 className={styles.roomName}>{name}</h2>
            <ul className={styles.list}>
              {g.shelves.map((s) => (
                <li key={s.id}>
                  <Link to={`/shelves/${encodeURIComponent(s.id)}`} className={styles.item}>
                    <span className={styles.name}>{s.name}</span>
                    <span className={styles.count}>{t('mshelves.count', { count: s.book_count })}</span>
                    <Icon name="chevron-right" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Every piece of furniture, by room, with how many books it holds. */
export function ShelvesPage() {
  const t = useT();
  return (
    <Screen
      title={t('mshelves.title')}
      leading={
        <Link to="/search" className={styles.back} aria-label={t('mshelves.back')}>
          <Icon name="chevron-left" size={22} />
        </Link>
      }
    >
      <Body />
    </Screen>
  );
}
