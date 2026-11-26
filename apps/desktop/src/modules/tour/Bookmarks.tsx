import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './Bookmarks.module.css';

export interface BookmarksProps {
  total: number;
  /** Zero-based index of the current step. */
  current: number;
}

/** Progress as small bookmarks: done (filled, with a tick), current (taller), to do (hollow) — and said in words. */
export function Bookmarks({ total, current }: BookmarksProps) {
  const t = useT();
  return (
    <ol className={styles.list} aria-label={t('tour.card.progress')}>
      {Array.from({ length: total }, (_, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={i} className={styles.item} data-state={state}>
            <span className={styles.mark} aria-hidden="true">
              <span className={styles.fill}>{state === 'done' ? <Icon name="check" size={9} /> : null}</span>
            </span>
            <span className={styles.sr}>{`${i + 1}: ${t(`tour.state.${state}`)}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
