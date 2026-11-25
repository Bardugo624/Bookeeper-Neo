import { useId } from 'react';
import { Link } from 'react-router';
import type { Stats } from '@bookeeper/api';
import { FillBar } from '@bookeeper/ui/book';
import { useT } from '../../app';
import styles from './ShelfFillCard.module.css';

/** Fill of each shelf unit, each linking to the unit in the shelves view. */
export function ShelfFillCard({ shelves }: { shelves: Stats['shelf_fill'] }) {
  const t = useT();
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {t('stats.shelfFill.title')}
      </h2>
      <ul className={styles.list}>
        {shelves.map((s) => (
          <li key={s.id} className={styles.item}>
            <Link to={`/shelves?unit=${encodeURIComponent(s.id)}`} className={styles.link}>
              {s.name}
            </Link>
            <FillBar tone="auto" value={s.pct} label={t('stats.shelfFill.bar', { name: s.name, pct: Math.round(s.pct * 100) })} />
            <span className={styles.count}>{t('stats.shelfFill.used', { used: s.used, capacity: s.capacity })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
